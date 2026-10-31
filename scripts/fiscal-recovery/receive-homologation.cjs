// Operator-only, invoked through SSH/systemd, never an HTTP endpoint.
// Receives private material only on stdin. No plaintext files or error dumps.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const requireApi = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = requireApi("@prisma/client");
const { CredentialVault } = requireApi("./dist/fiscal/credential-vault.js");
const { inspectCertificate } = requireApi("./dist/fiscal/certificate-files.js");
const db = new PrismaClient();

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 100000) throw new Error("size");
  }
  const data = JSON.parse(input);
  const {
    targetOrg,
    sourceOrg,
    cuit,
    holderCuit,
    fingerprint,
    certificate,
    privateKey,
  } = data;
  if (
    !/^[a-f0-9-]{36}$/.test(targetOrg) ||
    !/^[a-f0-9-]{36}$/.test(sourceOrg) ||
    !/^\d{11}$/.test(cuit) ||
    !/^\d{11}$/.test(holderCuit) ||
    data.environment !== "HOMOLOGATION" ||
    data.expectedVersion !== 1
  )
    throw new Error("scope");
  const checked = inspectCertificate(certificate, privateKey, holderCuit);
  if (checked.fingerprint !== fingerprint) throw new Error("fingerprint");
  const context = `fiscal-credential:v1:HOMOLOGATION:${targetOrg}`;
  const vault = new CredentialVault();
  if (vault.provider() !== "AES256_GCM") throw new Error("vault");
  const encryptedPrivateKey = await vault.seal(checked.privateKey, context);
  // Test the destination key before changing any persisted credential.
  inspectCertificate(
    checked.certificate,
    await new CredentialVault().open(encryptedPrivateKey, context),
    holderCuit,
  );
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${context}, 0))`;
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: targetOrg },
    });
    const current = await tx.fiscalCredential.findUniqueOrThrow({
      where: {
        organizationId_environment: {
          organizationId: targetOrg,
          environment: "HOMOLOGATION",
        },
      },
    });
    if (
      organization.fiscalProfile?.cuit !== cuit ||
      current.representedCuit !== cuit ||
      current.holderCuit !== holderCuit
    )
      throw new Error("identity");
    if (current.certificate || current.version !== data.expectedVersion)
      throw new Error("changed");
    if (
      await tx.fiscalTrial.count({
        where: {
          organizationId: targetOrg,
          status: { in: ["PENDING", "UNCERTAIN"] },
        },
      })
    )
      throw new Error("pending");
    if (data.dryRun === true) return "CHECK_OK";
    if (data.dryRun !== false) throw new Error("mode");
    const updated = await tx.fiscalCredential.update({
      where: { id: current.id },
      data: {
        encryptedPrivateKey,
        certificate: checked.certificate,
        fingerprint: checked.fingerprint,
        expiresAt: checked.expiresAt,
        csr: null,
        encryptedTicket: null,
        ticketExpiresAt: null,
        verifiedAt: null,
        version: current.version + 1,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: targetOrg,
        entityType: "FISCAL_CREDENTIAL",
        entityId: current.id,
        action: "RECOVERED_FROM_LOCAL",
        after: {
          environment: "HOMOLOGATION",
          sourceOrg,
          version: updated.version,
          fingerprint: checked.fingerprint,
          method: "OPERATOR_SSH",
        },
      },
    });
    return "RECOVERY_OK";
  });
  console.log(result);
}
main()
  .catch(() => {
    console.error("RECOVERY_ABORTED_NO_DETAILS");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
