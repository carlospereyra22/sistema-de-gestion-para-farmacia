import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { ReportsService } from "../src/reports/reports.service";

describe("reports detail isolated schema", () => {
  let app: TestingModule, db: PrismaService;
  const schema = `reports_detail_${randomUUID().replaceAll("-", "")}`;
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
      throw new Error(
        "Could not prepare isolated schema: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
  }, 100000);
  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^reports_detail_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  it("unidades vendidas: confirmadas con producto, menos devueltas, solo la sucursal", async () => {
    const org = await db.organization.create({ data: { name: "Unidades" } });
    const [branch, other] = await Promise.all(
      ["Centro", "Norte"].map((name, index) =>
        db.branch.create({
          data: { organizationId: org.id, name, code: `U${index}` },
        }),
      ),
    );
    const user = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    const permission = await db.permission.upsert({
      where: { code: "REPORT_READ" },
      update: {},
      create: { code: "REPORT_READ", description: "REPORT_READ" },
    });
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "CUSTOM",
        name: "Test",
        permissions: { create: { permissionId: permission.id } },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        roles: { create: { roleId: role.id } },
      },
    });
    const product = await db.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno" },
    });
    const completedAt = new Date("2026-10-15T15:00:00Z");
    const sale = (
      branchId: string,
      status: "COMPLETED" | "CANCELLED" | "DRAFT",
      items: { productId?: string; description?: string; quantity: number }[],
    ) =>
      db.sale.create({
        data: {
          organizationId: org.id,
          branchId,
          status,
          totalMinor: 1000n,
          completedAt: status === "DRAFT" ? null : completedAt,
          items: {
            create: items.map((item) => ({ ...item, unitPriceMinor: 100n })),
          },
        },
        include: { items: true },
      });
    const valid = await sale(branch!.id, "COMPLETED", [
      { productId: product.id, quantity: 3 },
      { description: "Concepto manual", quantity: 5 },
    ]);
    await sale(branch!.id, "CANCELLED", [
      { productId: product.id, quantity: 10 },
    ]);
    await sale(branch!.id, "DRAFT", [{ productId: product.id, quantity: 20 }]);
    await sale(other!.id, "COMPLETED", [
      { productId: product.id, quantity: 7 },
    ]);
    await db.customerReturn.create({
      data: {
        organizationId: org.id,
        branchId: branch!.id,
        saleId: valid.id,
        actorId: user.id,
        reason: "Devolucion de prueba",
        createdAt: new Date("2026-10-16T15:00:00Z"),
        items: {
          create: {
            saleItemId: valid.items.find((item) => item.productId)!.id,
            quantity: 1,
          },
        },
      },
    });

    const detail = await new ReportsService(db).detail(
      user.id,
      org.id,
      branch!.id,
      "2026-10-01",
      "2026-10-31",
    );
    expect(detail.unitsSold).toBe(2);
    expect(detail.saleCount).toBe(1);
  });
});
