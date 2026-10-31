// Run from apps/api with --env-file=.env -r ts-node/register.
// Only the public success marker from the receiver is printed.
const { createRequire } = require("node:module");
const { resolve, join } = require("node:path");
const { spawn } = require("node:child_process");
const requireApi = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = requireApi("@prisma/client");
const { CredentialVault } = requireApi("./src/fiscal/credential-vault.ts");
const { inspectCertificate } = requireApi("./src/fiscal/certificate-files.ts");
const db = new PrismaClient();
async function main() {
  const [sourceOrg, targetOrg, mode] = process.argv.slice(2);
  if (!["check", "transfer"].includes(mode)) throw new Error("mode");
  const database = new URL(process.env.DATABASE_URL);
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname != "/gestion_dev"
  )
    throw new Error("database");
  const source = await db.fiscalCredential.findUniqueOrThrow({
    where: {
      organizationId_environment: {
        organizationId: sourceOrg,
        environment: "HOMOLOGATION",
      },
    },
  });
  const privateKey = await new CredentialVault().open(
    source.encryptedPrivateKey,
    `fiscal-credential:v1:HOMOLOGATION:${sourceOrg}`,
  );
  const checked = inspectCertificate(
    source.certificate,
    privateKey,
    source.holderCuit,
  );
  if (checked.fingerprint !== source.fingerprint)
    throw new Error("fingerprint");
  const payload = {
    targetOrg,
    sourceOrg,
    cuit: source.representedCuit,
    holderCuit: source.holderCuit,
    fingerprint: checked.fingerprint,
    certificate: checked.certificate,
    privateKey: checked.privateKey,
    environment: "HOMOLOGATION",
    expectedVersion: 1,
    dryRun: mode === "check",
  };
  await new Promise((resolve, reject) => {
    const child = spawn(
      "ssh.exe",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=10",
        "-i",
        join(process.env.USERPROFILE, ".ssh", "oracle-gestion.key"),
        "ubuntu@163.176.241.51",
        "sudo -n systemd-run --quiet --wait --pipe --collect --uid=ubuntu --property=WorkingDirectory=/home/ubuntu/gestion-releases/20260927-223716-08d51238/apps/api --property=EnvironmentFile=/etc/gestion-api/environment --setenv=FISCAL_VAULT_KEY_FILE=/etc/gestion-fiscal/vault.key /usr/local/bin/node /home/ubuntu/gestion-recovery-20260927.cjs",
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 4096) child.kill();
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      if (
        code === 0 &&
        output.trim() === (mode === "check" ? "CHECK_OK" : "RECOVERY_OK")
      ) {
        console.log(output.trim());
        resolve();
      } else reject(new Error("remote"));
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
main()
  .catch(() => {
    console.error("TRANSFER_FAILED_NO_SECRET_OUTPUT");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
