import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CredentialVault } from "./credential-vault";

describe("external master key file", () => {
  const oldKey = process.env.FISCAL_VAULT_KEY;
  const oldFile = process.env.FISCAL_VAULT_KEY_FILE;
  let folder: string;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "gestion-vault-test-"));
    delete process.env.FISCAL_VAULT_KEY;
    process.env.FISCAL_VAULT_KEY_FILE = join(folder, "key");
  });
  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
    if (oldKey === undefined) delete process.env.FISCAL_VAULT_KEY;
    else process.env.FISCAL_VAULT_KEY = oldKey;
    if (oldFile === undefined) delete process.env.FISCAL_VAULT_KEY_FILE;
    else process.env.FISCAL_VAULT_KEY_FILE = oldFile;
  });
  it("does not fall back to local storage when an explicit file is missing or invalid", () => {
    expect(new CredentialVault().provider()).toBe("UNAVAILABLE");
    writeFileSync(process.env.FISCAL_VAULT_KEY_FILE!, "invalid", {
      mode: 0o600,
    });
    expect(new CredentialVault().provider()).toBe("UNAVAILABLE");
  });
  it("recovers ciphertext after restart while binding it to organization and environment", async () => {
    writeFileSync(
      process.env.FISCAL_VAULT_KEY_FILE!,
      randomBytes(32).toString("hex") + "\n",
      { mode: 0o600 },
    );
    const vault = new CredentialVault();
    expect(vault.provider()).toBe("AES256_GCM");
    const sealed = await vault.seal("fixture-key", "org:PRODUCTION");
    expect(sealed).not.toContain("fixture-key");
    expect(await new CredentialVault().open(sealed, "org:PRODUCTION")).toBe(
      "fixture-key",
    );
    await expect(vault.open(sealed, "org:HOMOLOGATION")).rejects.toThrow();
    if (process.platform !== "win32") {
      chmodSync(process.env.FISCAL_VAULT_KEY_FILE!, 0o644);
      expect(vault.provider()).toBe("UNAVAILABLE");
    }
  });
});
