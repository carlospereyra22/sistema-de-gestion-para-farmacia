import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { AuditService } from "../src/audit/audit.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { TransfersService } from "../src/transfers/transfers.service";

describe("transfers between branches (isolated schema)", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `transfers_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
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
      throw new Error("Could not prepare isolated transfer schema");
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    first = new PrismaService(environment);
    second = new PrismaService(environment);
    await Promise.all([first.$connect(), second.$connect()]);
  }, 100000);

  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    if (app && /^transfers_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  it("reuses the organization product and credits the destination only once", async () => {
    const org = await first.organization.create({
      data: { name: "Transfer fixture" },
    });
    const source = await first.branch.create({
      data: { organizationId: org.id, name: "Origen", code: "ORIGEN" },
    });
    const destination = await first.branch.create({
      data: { organizationId: org.id, name: "Destino", code: "DESTINO" },
    });
    const user = await first.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "fixture",
      },
    });
    const permission = await first.permission.upsert({
      where: { code: "INVENTORY_MANAGE" },
      update: {},
      create: { code: "INVENTORY_MANAGE", description: "Manage inventory" },
    });
    const role = await first.role.create({
      data: {
        organizationId: org.id,
        code: "TEST",
        name: "Test",
        permissions: { create: { permissionId: permission.id } },
      },
    });
    await first.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    const product = await first.product.create({
      data: { organizationId: org.id, name: "Producto compartido" },
    });
    const sourceLot = await first.productLot.create({
      data: {
        organizationId: org.id,
        branchId: source.id,
        productId: product.id,
        number: "LOTE-1",
        quantity: 4,
        unitCostMinor: 100n,
      },
    });
    const supplier = await first.supplier.create({
      data: { organizationId: org.id, name: "Proveedor del lote" },
    });
    await first.inventoryMovement.create({
      data: {
        organizationId: org.id,
        branchId: source.id,
        productId: product.id,
        lotId: sourceLot.id,
        type: "PURCHASE_RECEIPT",
        quantity: 4,
        supplierId: supplier.id,
      },
    });
    const firstService = new TransfersService(first, new AuditService(first));
    const secondService = new TransfersService(
      second,
      new AuditService(second),
    );
    const transfer = await firstService.create(user.id, org.id, source.id, {
      destinationBranchId: destination.id,
      items: [{ lotId: sourceLot.id, quantity: 2 }],
    });
    await firstService.dispatch(user.id, org.id, source.id, transfer.id);

    const attempts = await Promise.allSettled([
      firstService.receive(user.id, org.id, destination.id, transfer.id),
      secondService.receive(user.id, org.id, destination.id, transfer.id),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await first.product.count({ where: { organizationId: org.id } }),
    ).toBe(1);
    const destinationLot = await first.productLot.findUnique({
      where: {
        branchId_productId_number: {
          branchId: destination.id,
          productId: product.id,
          number: "LOTE-1",
        },
      },
    });
    expect(destinationLot?.quantity).toBe(2);
    // El lote conserva su proveedor para poder devolverlo desde el destino.
    expect(
      await first.inventoryMovement.count({
        where: {
          lotId: destinationLot!.id,
          supplierId: supplier.id,
          quantity: 2,
        },
      }),
    ).toBe(1);
    expect(
      await first.inventoryMovement.count({
        where: { referenceId: transfer.id, type: "TRANSFER_IN" },
      }),
    ).toBe(1);
  });
});
