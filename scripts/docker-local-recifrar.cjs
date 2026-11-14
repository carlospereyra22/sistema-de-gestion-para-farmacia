// Credenciales fiscales para la prueba con Docker en la PC (SISTEMA-106).
//
// En Windows la API guarda las claves de ARCA cifradas con DPAPI, atado al
// usuario de Windows. La API en Docker corre en Linux y no puede abrirlas.
// Este script, llamado por `scripts/docker-local.ps1 copiar-datos`:
//
//   1. lee de gestion_dev (sólo lectura) cada valor protegido con DPAPI;
//   2. lo abre en Windows con DPAPI, con el mismo contexto que usa la API;
//   3. lo vuelve a cifrar con AES-256-GCM, en el formato de CredentialVault,
//      usando una clave propia de esta PC (.cache/docker-local/clave-fiscal.env,
//      se crea si no existe);
//   4. deja un archivo SQL con los UPDATE para la base de Docker.
//
// Nunca escribe en gestion_dev ni muestra secretos. Las credenciales de
// PRODUCCIÓN no se copian: en la PC no se usan (FISCAL_LOCAL_TESTING).
//
// Uso: node scripts/docker-local-recifrar.cjs <archivo-sql-de-salida>

const { spawn } = require("node:child_process");
const { createCipheriv, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const carpeta = path.join(raiz, ".cache", "docker-local");
const archivoClave = path.join(carpeta, "clave-fiscal.env");

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function urlDeGestionDev() {
  const env = fs.readFileSync(path.join(raiz, "apps", "api", ".env"), "utf8");
  const linea = env
    .split(/\r?\n/)
    .find((texto) => /^\s*DATABASE_URL\s*=/.test(texto));
  if (!linea) fallar("apps/api/.env no tiene DATABASE_URL.");
  const valor = linea
    .replace(/^\s*DATABASE_URL\s*=\s*/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  const url = new URL(valor);
  if (
    url.pathname !== "/gestion_dev" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    fallar("Por seguridad sólo se lee gestion_dev de esta PC.");
  return valor;
}

function claveLocal() {
  fs.mkdirSync(carpeta, { recursive: true });
  if (!fs.existsSync(archivoClave))
    fs.writeFileSync(
      archivoClave,
      `FISCAL_VAULT_KEY=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600 },
    );
  const clave = /FISCAL_VAULT_KEY=([a-f0-9]{64})/.exec(
    fs.readFileSync(archivoClave, "utf8"),
  )?.[1];
  if (!clave) fallar(`${archivoClave} no tiene una clave válida.`);
  return Buffer.from(clave, "hex");
}

// Igual que apps/api/src/fiscal/credential-vault.ts: nada secreto en argumentos.
function abrirDpapi(payload, contexto) {
  const script =
    "$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; " +
    "$d=([Console]::In.ReadToEnd() | ConvertFrom-Json); " +
    "$r=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($d.value)," +
    "[Text.Encoding]::UTF8.GetBytes($d.context),[Security.Cryptography.DataProtectionScope]::CurrentUser); " +
    "[Console]::Out.Write([Convert]::ToBase64String($r)); } catch { exit 1 }";
  return new Promise((resolve, reject) => {
    const hijo = spawn(
      path.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let salida = "";
    hijo.stdout.on("data", (parte) => (salida += parte.toString("ascii")));
    hijo.on("error", reject);
    hijo.on("close", (codigo) =>
      codigo === 0 && /^[A-Za-z0-9+/]+=*$/.test(salida)
        ? resolve(Buffer.from(salida, "base64").toString("utf8"))
        : reject(new Error("DPAPI")),
    );
    hijo.stdin.end(JSON.stringify({ value: payload, context: contexto }));
  });
}

function cifrarAes(clave, texto, contexto) {
  const nonce = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, nonce);
  cifrador.setAAD(Buffer.from(contexto));
  const cifrado = Buffer.concat([
    cifrador.update(texto, "utf8"),
    cifrador.final(),
  ]);
  return JSON.stringify({
    v: 1,
    provider: "AES256_GCM",
    nonce: nonce.toString("base64"),
    tag: cifrador.getAuthTag().toString("base64"),
    payload: cifrado.toString("base64"),
  });
}

const sqlTexto = (valor) => `'${valor.replace(/'/g, "''")}'`;

async function main() {
  const salida = process.argv[2];
  if (!salida)
    fallar("Uso: node scripts/docker-local-recifrar.cjs <salida.sql>");
  process.env.DATABASE_URL = urlDeGestionDev();
  const { PrismaClient } = require(
    require.resolve("@prisma/client", {
      paths: [path.join(raiz, "apps", "api")],
    }),
  );
  const prisma = new PrismaClient();
  const clave = claveLocal();
  const sentencias = [];
  let convertidos = 0;
  let fallidos = 0;

  // Convierte un valor si está protegido con DPAPI. Devuelve el SQL o null.
  async function convertir(envoltorio, contexto) {
    if (!envoltorio) return null;
    let datos;
    try {
      datos = JSON.parse(envoltorio);
    } catch {
      return null;
    }
    if (datos?.provider !== "WINDOWS_DPAPI") return null;
    try {
      const texto = await abrirDpapi(datos.payload, contexto);
      convertidos += 1;
      return sqlTexto(cifrarAes(clave, texto, contexto));
    } catch {
      fallidos += 1;
      return null;
    }
  }

  try {
    const fiscales = await prisma.fiscalCredential.findMany({
      where: { environment: { not: "PRODUCTION" } },
      select: {
        id: true,
        organizationId: true,
        environment: true,
        version: true,
        encryptedPrivateKey: true,
        encryptedTicket: true,
        encryptedPadronTicket: true,
      },
    });
    for (const fila of fiscales) {
      const { organizationId: org, environment: amb, version } = fila;
      const cambios = [
        [
          "encryptedPrivateKey",
          await convertir(
            fila.encryptedPrivateKey,
            `fiscal-credential:v1:${amb}:${org}`,
          ),
        ],
        [
          "encryptedTicket",
          await convertir(
            fila.encryptedTicket,
            `fiscal-access:${amb}:${org}:${version}`,
          ),
        ],
        [
          "encryptedPadronTicket",
          await convertir(
            fila.encryptedPadronTicket,
            `fiscal-padron:${amb}:${org}:${version}`,
          ),
        ],
      ].filter(([, valor]) => valor);
      if (cambios.length)
        sentencias.push(
          `UPDATE "FiscalCredential" SET ${cambios.map(([columna, valor]) => `"${columna}" = ${valor}`).join(", ")} WHERE id = '${fila.id}';`,
        );
    }

    const padrones = await prisma.platformPadronCredential.findMany({
      where: { environment: { not: "PRODUCTION" } },
      select: {
        id: true,
        environment: true,
        version: true,
        encryptedPrivateKey: true,
        encryptedTicket: true,
      },
    });
    for (const fila of padrones) {
      const base = `platform-padron:v1:${fila.environment}`;
      const cambios = [
        [
          "encryptedPrivateKey",
          await convertir(fila.encryptedPrivateKey, base),
        ],
        [
          "encryptedTicket",
          await convertir(
            fila.encryptedTicket,
            `${base}:acceso:${fila.version}`,
          ),
        ],
      ].filter(([, valor]) => valor);
      if (cambios.length)
        sentencias.push(
          `UPDATE "PlatformPadronCredential" SET ${cambios.map(([columna, valor]) => `"${columna}" = ${valor}`).join(", ")} WHERE id = '${fila.id}';`,
        );
    }

    const admins = await prisma.platformAdmin.findMany({
      where: { totpSecret: { not: null } },
      select: { id: true, userId: true, totpSecret: true },
    });
    for (const fila of admins) {
      const valor = await convertir(
        fila.totpSecret,
        `platform-totp:${fila.userId}`,
      );
      if (valor)
        sentencias.push(
          `UPDATE "PlatformAdmin" SET "totpSecret" = ${valor} WHERE id = '${fila.id}';`,
        );
    }
  } finally {
    await prisma.$disconnect();
  }

  fs.writeFileSync(salida, sentencias.join("\n") + "\n", { mode: 0o600 });
  console.log(
    `Credenciales fiscales convertidas para Docker: ${convertidos}` +
      (fallidos ? ` (no se pudieron abrir: ${fallidos})` : "") +
      ".",
  );
}

main().catch(() =>
  fallar("No se pudieron convertir las credenciales fiscales."),
);
