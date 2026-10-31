// Read-only operational probe. Print allowlisted metadata, never environment or secrets.
const { execFileSync } = require("node:child_process");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createRequire } = require("node:module");
async function main() {
  const api = execFileSync(
    "systemctl",
    ["show", "gestion-api", "-p", "WorkingDirectory", "--value"],
    { encoding: "utf8" },
  ).trim();
  if (
    !/^\/home\/ubuntu\/gestion-releases\/[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\/apps\/api$/.test(
      api,
    )
  )
    throw new Error();
  const pid = execFileSync(
    "systemctl",
    ["show", "gestion-api", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  if (!/^[1-9]\d*$/.test(pid)) throw new Error();
  const env = Object.fromEntries(
    readFileSync("/proc/" + pid + "/environ", "utf8")
      .split("\0")
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [item.slice(0, index), item.slice(index + 1)];
      }),
  );
  const requireApp = createRequire(join(api, "package.json"));
  const { PrismaClient } = requireApp("@prisma/client");
  const client = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
  try {
    const org = "25a5c79f-7046-4b42-a656-dcca34063ab6";
    const organization = await client.organization.findUniqueOrThrow({
      where: { id: org },
      select: { fiscalProfile: true },
    });
    const base = existsSync(join(api, "dist/src/main.js"))
      ? join(api, "dist/src")
      : join(api, "dist");
    const { fiscalReadiness } = requireApp(
      join(base, "organizations/fiscal-readiness.js"),
    );
    const profile = organization.fiscalProfile;
    const credential = await client.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId: org,
          environment: "PRODUCTION",
        },
      },
      select: { version: true, verifiedAt: true, expiresAt: true },
    });
    const branches = await client.branch.findMany({
      where: { organizationId: org, active: true },
      select: { id: true, name: true },
    });
    const configurations = await client.fiscalProductionConfiguration.findMany({
      where: { organizationId: org },
      select: {
        branchId: true,
        point: true,
        enabled: true,
        credentialVersion: true,
      },
    });
    const documents = await client.fiscalDocument.count({
      where: { organizationId: org },
    });
    process.stdout.write(
      JSON.stringify({
        api,
        issuanceRuntimeEnabled: env.FISCAL_PRODUCTION_ISSUANCE === "enabled",
        recoveryVerified: env.FISCAL_RECOVERY_VERIFIED === "yes",
        profileReady:
          fiscalReadiness(profile, 1).checks[0].ready &&
          !!profile.grossIncomeId,
        vatCondition: profile.vatCondition,
        credential,
        branches,
        configurations,
        documents,
      }),
    );
  } finally {
    await client.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("No se pudo completar la comprobacion operativa.\n");
  process.exitCode = 1;
});
