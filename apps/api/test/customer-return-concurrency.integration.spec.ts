import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AuditService } from "../src/audit/audit.service";
import { SalesService } from "../src/sales/sales.service";

// Dos devoluciones de la misma venta al mismo tiempo (doble clic o dos PCs)
// no pueden pasar las dos el control de cantidad: la venta se bloquea.
describe("devoluciones simultáneas en un esquema aislado", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `return_concurrency_${randomUUID().replaceAll("-", "")}`;
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
    if (app && /^return_concurrency_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  it("de dos devoluciones de todo lo vendido sólo se registra una", async () => {
    const org = await first.organization.create({
      data: { name: "Devoluciones simultáneas" },
    });
    const branch = await first.branch.create({
      data: { organizationId: org.id, name: "Centro", code: "CEN" },
    });
    const user = await first.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        passwordHash: "fixture",
      },
    });
    const permission = await first.permission.upsert({
      where: { code: "SALE_MANAGE" },
      update: {},
      create: { code: "SALE_MANAGE", description: "SALE_MANAGE" },
    });
    const role = await first.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Admin",
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
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    const sale = await first.sale.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        status: "COMPLETED",
        totalMinor: 30000n,
        completedAt: new Date(),
        items: {
          create: {
            productId: product.id,
            quantity: 3,
            unitPriceMinor: 10000n,
          },
        },
      },
      include: { items: true },
    });
    const services = [first, second].map(
      (db) => new SalesService(db, new AuditService(db)),
    );
    const devolverTodo = (service: SalesService) =>
      service.customerReturn(user.id, org.id, branch.id, sale.id, {
        reason: "Doble clic",
        items: [{ saleItemId: sale.items[0]!.id, quantity: 3 }],
      });

    const results = await Promise.allSettled(services.map(devolverTodo));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(String(rejected?.reason)).toContain("supera la vendida");
    expect(
      await first.customerReturnItem.aggregate({
        where: { saleItemId: sale.items[0]!.id },
        _sum: { quantity: true },
      }),
    ).toEqual({ _sum: { quantity: 3 } });
  });
});
