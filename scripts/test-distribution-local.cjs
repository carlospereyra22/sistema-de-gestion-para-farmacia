// Local PostgreSQL integration checks. Creates and removes ONLY its own fixture organization.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const root = resolve(__dirname, "..");
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
apiRequire("reflect-metadata");
const { PrismaClient } = apiRequire("@prisma/client");
const { DistributionService } = require(
  resolve(root, "apps/api/dist/src/inventory/distribution.service.js"),
);
const { AuditService } = require(
  resolve(root, "apps/api/dist/src/audit/audit.service.js"),
);
const envText = readFileSync(resolve(root, "apps/api/.env"), "utf8").replace(
  /^\uFEFF/,
  "",
);
const url =
  process.env.DATABASE_URL ||
  envText
    .match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
const target = new URL(url);
assert(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "5432" &&
    target.pathname === "/gestion_dev",
  "Only local gestion_dev is allowed",
);
const db = new PrismaClient({ datasources: { db: { url } } });
const orgId = randomUUID();
const branchId = randomUUID();
const actorId = randomUUID();
// Permission behavior is unit-tested separately; here use real transactions, locks and audit writes.
const adapter = new Proxy(db, {
  get(object, key) {
    if (key === "userOrganization")
      return {
        findUnique: async () => ({
          active: true,
          roles: [
            {
              role: {
                permissions: ["INVENTORY_MANAGE", "INVENTORY_READ"].map(
                  (code) => ({ permission: { code } }),
                ),
              },
            },
          ],
        }),
      };
    const value = Reflect.get(object, key);
    return typeof value === "function" ? value.bind(object) : value;
  },
});
const service = new DistributionService(adapter, new AuditService(adapter));
async function run() {
  await db.organization.create({
    data: { id: orgId, name: `Distribution integration ${orgId}` },
  });
  await db.branch.create({
    data: {
      id: branchId,
      organizationId: orgId,
      name: "Test only",
      code: "DIST-TEST",
    },
  });
  const product = await db.product.create({
    data: { organizationId: orgId, name: "Fixture only" },
  });
  const lot = await db.productLot.create({
    data: {
      id: `00000000-${randomUUID().slice(9)}`,
      organizationId: orgId,
      branchId,
      productId: product.id,
      number: "1",
      quantity: 10,
      unitCostMinor: 100,
    },
  });
  const input = {
    requestId: randomUUID(),
    destination: "External fixture",
    reason: "Integration check",
    confirmed: true,
    items: [{ lotId: lot.id, quantity: 3 }],
  };
  const [a, b] = await Promise.all([
    service.create(actorId, orgId, branchId, input),
    service.create(actorId, orgId, branchId, input),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    (await db.productLot.findUniqueOrThrow({ where: { id: lot.id } })).quantity,
    7,
  );
  assert.equal(
    await db.inventoryMovement.count({ where: { organizationId: orgId } }),
    1,
  );
  const secondLot = await db.productLot.create({
    data: {
      id: `ffffffff-${randomUUID().slice(9)}`,
      organizationId: orgId,
      branchId,
      productId: product.id,
      number: "2",
      quantity: 0,
      unitCostMinor: 100,
    },
  });
  await assert.rejects(
    service.create(actorId, orgId, branchId, {
      ...input,
      requestId: randomUUID(),
      items: [
        { lotId: lot.id, quantity: 1 },
        { lotId: secondLot.id, quantity: 1 },
      ],
    }),
  );
  assert.equal(
    (await db.productLot.findUniqueOrThrow({ where: { id: lot.id } })).quantity,
    7,
    "all items must roll back",
  );
  const concurrent = await Promise.allSettled(
    [1, 2].map(() =>
      service.create(actorId, orgId, branchId, {
        ...input,
        requestId: randomUUID(),
        items: [{ lotId: lot.id, quantity: 5 }],
      }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.productLot.findUniqueOrThrow({ where: { id: lot.id } })).quantity,
    2,
  );
  await Promise.all([
    service.reverse(actorId, orgId, branchId, a.id, "Fixture reversal", true),
    service.reverse(actorId, orgId, branchId, a.id, "Fixture reversal", true),
  ]);
  assert.equal(
    (await db.productLot.findUniqueOrThrow({ where: { id: lot.id } })).quantity,
    5,
    "reversal must apply once",
  );
  await assert.rejects(
    db.productLot.update({ where: { id: lot.id }, data: { quantity: -1 } }),
  );
  assert.equal(await db.sale.count({ where: { organizationId: orgId } }), 0);
  assert.equal(
    await db.distributionDispatch.count({ where: { organizationId: orgId } }),
    2,
  );
  console.log(
    "PASS: concurrent retry, atomic rollback, concurrent stock depletion, one-time reversal, nonnegative stock, no sales.",
  );
}
run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Exact freshly-created UUID scope; never touches pre-existing organizations or documents.
    await db.$transaction(async (tx) => {
      await tx.distributionDispatchItem.deleteMany({
        where: { dispatch: { organizationId: orgId } },
      });
      await tx.distributionDispatch.deleteMany({
        where: { organizationId: orgId },
      });
      await tx.inventoryMovement.deleteMany({
        where: { organizationId: orgId },
      });
      await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
      await tx.productLot.deleteMany({ where: { organizationId: orgId } });
      await tx.product.deleteMany({ where: { organizationId: orgId } });
      await tx.branch.deleteMany({ where: { organizationId: orgId } });
      await tx.organization.deleteMany({ where: { id: orgId } });
    });
    await db.$disconnect();
  });
