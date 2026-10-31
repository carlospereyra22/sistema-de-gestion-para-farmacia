import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { changeBranchProduct } from "../src/catalog/branch-product-lifecycle";

describe("branch product concurrency on an isolated synthetic schema", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `product_concurrency_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    url.searchParams.set("schema", schema);
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error("Could not prepare isolated schema");
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    first = new PrismaService(environment);
    second = new PrismaService(environment);
    await Promise.all([first.$connect(), second.$connect()]);
  }, 100000);
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    if (app && /^product_concurrency_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });
  async function fixture() {
    const org = await first.organization.create({
      data: { name: "Synthetic concurrency" },
    });
    const branch = await first.branch.create({
      data: { organizationId: org.id, name: "A", code: "A" },
    });
    const user = await first.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "fixture",
      },
    });
    const role = await first.role.create({
      data: { organizationId: org.id, code: "ADMIN", name: "Admin" },
    });
    await first.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    await first.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const product = await first.product.create({
      data: { organizationId: org.id, name: "Fixture" },
    });
    const lot = await first.productLot.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        productId: product.id,
        number: "L",
        quantity: 4,
        unitCostMinor: 100n,
      },
    });
    await first.$transaction((tx) =>
      changeBranchProduct(tx, user.id, org.id, branch.id, product.id, {
        status: "ARCHIVED",
        expectedStatus: "ACTIVE",
        reason: "Archive fixture",
      }),
    );
    const state = await first.productBranchState.findUniqueOrThrow({
      where: {
        branchId_productId: { branchId: branch.id, productId: product.id },
      },
    });
    return {
      org,
      branch,
      user,
      product,
      lot,
      expectedUpdatedAt: state.updatedAt.toISOString(),
    };
  }
  function signal() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }
  it("does not delete stock added while waiting for a concurrent writer", async () => {
    const f = await fixture();
    const locked = signal();
    const release = signal();
    const writer = first.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${f.product.id}::uuid FOR UPDATE`;
        await tx.productLot.update({
          where: { id: f.lot.id },
          data: { quantity: { increment: 1 } },
        });
        locked.resolve();
        await release.promise;
      },
      { timeout: 15000 },
    );
    await locked.promise;
    const started = signal();
    const deletion = second.$transaction(async (tx) => {
      started.resolve();
      return changeBranchProduct(
        tx,
        f.user.id,
        f.org.id,
        f.branch.id,
        f.product.id,
        {
          status: "DELETED",
          expectedStatus: "ARCHIVED",
          expectedUpdatedAt: f.expectedUpdatedAt,
          expectedStock: 4,
          confirmStockWriteOff: true,
          reason: "Delete fixture",
        },
      );
    });
    const assertion = expect(deletion).rejects.toThrow("stock actual");
    await started.promise;
    release.resolve();
    await writer;
    await assertion;
    expect(
      (await first.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
        .quantity,
    ).toBe(5);
    expect(
      await first.inventoryMovement.count({
        where: { productId: f.product.id },
      }),
    ).toBe(0);
  });
  it("rejects stock written concurrently after a deletion, leaving the write-off exactly once", async () => {
    const f = await fixture();
    const deleted = signal();
    const release = signal();
    const deletion = first.$transaction(
      async (tx) => {
        await changeBranchProduct(
          tx,
          f.user.id,
          f.org.id,
          f.branch.id,
          f.product.id,
          {
            status: "DELETED",
            expectedStatus: "ARCHIVED",
            expectedUpdatedAt: f.expectedUpdatedAt,
            expectedStock: 4,
            confirmStockWriteOff: true,
            reason: "Delete fixture",
          },
        );
        deleted.resolve();
        await release.promise;
      },
      { timeout: 15000 },
    );
    await deleted.promise;
    const started = signal();
    const writer = second.$transaction(async (tx) => {
      started.resolve();
      return tx.productLot.update({
        where: { id: f.lot.id },
        data: { quantity: { increment: 1 } },
      });
    });
    const assertion = expect(writer).rejects.toThrow("BRANCH_PRODUCT_REMOVED");
    await started.promise;
    release.resolve();
    await deletion;
    await assertion;
    expect(
      (await first.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
        .quantity,
    ).toBe(0);
    expect(
      await first.inventoryMovement.count({
        where: { productId: f.product.id },
      }),
    ).toBe(1);
  });
});
