import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";

// No private material in command-line arguments, temporary files or logs.
async function dpapi(
  value: string,
  context: string,
  decrypt: boolean,
): Promise<string> {
  const script = `$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $inputData=([Console]::In.ReadToEnd() | ConvertFrom-Json); $raw=[Convert]::FromBase64String($inputData.value); $entropy=[Text.Encoding]::UTF8.GetBytes($inputData.context); $result=[Security.Cryptography.ProtectedData]::${decrypt ? "Unprotect" : "Protect"}($raw,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result)); } catch { exit 1 }`;
  return new Promise((resolve, reject) => {
    const processChild = spawn(
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      processChild.kill();
      reject(new Error("Vault unavailable"));
    }, 10000);
    processChild.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("ascii");
      if (output.length > 64000) processChild.kill();
    });
    processChild.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Vault unavailable"));
    });
    processChild.stdin.on("error", () => {
      /* close handler returns a sanitized error */
    });
    processChild.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && /^[A-Za-z0-9+/]+=*$/.test(output)) resolve(output);
      else reject(new Error("Vault unavailable"));
    });
    processChild.stdin.end(JSON.stringify({ value, context }));
  });
}

@Injectable()
export class CredentialVault {
  private masterKey(): string | undefined {
    if (process.env.FISCAL_VAULT_KEY !== undefined)
      return process.env.FISCAL_VAULT_KEY;
    const path = process.env.FISCAL_VAULT_KEY_FILE;
    if (path === undefined) return undefined;
    try {
      const metadata = statSync(path);
      if (
        !metadata.isFile() ||
        metadata.size > 128 ||
        (process.platform !== "win32" && (metadata.mode & 0o007) !== 0)
      )
        return "";
      return readFileSync(path, "utf8").trim();
    } catch {
      return "";
    }
  }
  provider(): "AES256_GCM" | "WINDOWS_DPAPI" | "UNAVAILABLE" {
    const key = this.masterKey();
    if (key !== undefined)
      return /^[a-fA-F0-9]{64}$/.test(key) ? "AES256_GCM" : "UNAVAILABLE";
    return process.platform === "win32" && process.env.NODE_ENV !== "production"
      ? "WINDOWS_DPAPI"
      : "UNAVAILABLE";
  }
  async seal(plain: string, context: string): Promise<string> {
    try {
      const provider = this.provider();
      if (provider === "WINDOWS_DPAPI")
        return JSON.stringify({
          v: 1,
          provider,
          payload: await dpapi(
            Buffer.from(plain).toString("base64"),
            context,
            false,
          ),
        });
      if (provider !== "AES256_GCM") throw new Error();
      const nonce = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(this.masterKey()!, "hex"),
        nonce,
      );
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ]);
      return JSON.stringify({
        v: 1,
        provider,
        nonce: nonce.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        payload: encrypted.toString("base64"),
      });
    } catch {
      throw new ServiceUnavailableException(
        "No se pudo proteger la clave técnica. No se guardaron archivos. Revisá la configuración segura del servidor.",
      );
    }
  }
  async open(envelope: string, context: string): Promise<string> {
    try {
      const data = JSON.parse(envelope) as Record<string, unknown>;
      if (data.v !== 1 || typeof data.payload !== "string") throw new Error();
      if (data.provider === "WINDOWS_DPAPI" && process.platform === "win32")
        return Buffer.from(
          await dpapi(data.payload, context, true),
          "base64",
        ).toString("utf8");
      if (
        data.provider !== "AES256_GCM" ||
        this.provider() !== "AES256_GCM" ||
        typeof data.nonce !== "string" ||
        typeof data.tag !== "string"
      )
        throw new Error();
      const cipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(this.masterKey()!, "hex"),
        Buffer.from(data.nonce, "base64"),
      );
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(Buffer.from(data.tag, "base64"));
      return Buffer.concat([
        cipher.update(Buffer.from(data.payload, "base64")),
        cipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ServiceUnavailableException(
        "No se pudo abrir la clave técnica protegida. No la reemplaces: revisá el acceso al almacén seguro del servidor.",
      );
    }
  }
}
