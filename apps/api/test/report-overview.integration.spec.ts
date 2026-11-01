import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { ReportAccessService } from "../src/reports/report-access.service";
import { ReportOverviewService } from "../src/reports/report-overview.service";

/**
 * Caso armado a mano (octubre 2026, importes en centavos):
 * - V1 Centro 10/10: 3 u. de A a 1000 (lote costo 400). Paga 2000 efectivo + 1500
 *   transferencia: vuelto 500 -> efectivo neto 1500. El 25/10 devuelve 1 u.
 * - V2 Norte 20/10: concepto manual 1000 (sin lote ni producto), tarjeta.
 * - V3 Centro 31/10 23:59 local: 1 u. de A a 1000, cuenta corriente.
 * - Excluidas: anulada del 12/10 y venta del 01/11 00:00 local.
 * - Periodo anterior (31/08 a 30/09): 1 u. de A a 2000.
 */
describe("report overview isolated schema", () => {
  let app: TestingModule, db: PrismaService, reports: ReportOverviewService;
  const schema = `report_overview_${randomUUID().replaceAll("-", "")}`;
  const now = new Date("2026-11-05T12:00:00Z");
  const october = { from: "2026-10-01", to: "2026-10-31" };
  let fixture: Awaited<ReturnType<typeof seed>>;

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
    reports = new ReportOverviewService(db, new ReportAccessService(db));
    fixture = await seed();
  }, 100000);
  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^report_overview_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function user(
    orgId: string,
    codes: string[],
    branchIds: string[],
  ): Promise<string> {
    const created = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    const permissions = await Promise.all(
      codes.map((code) =>
        db.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `R${randomUUID().slice(0, 8)}`,
        name: "Test",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: created.id,
        organizationId: orgId,
        roles: { create: { roleId: role.id } },
      },
    });
    for (const branchId of branchIds)
      await db.userBranch.create({ data: { userId: created.id, branchId } });
    return created.id;
  }

  async function seed() {
    const org = await db.organization.create({ data: { name: "Resumen" } });
    const [centro, norte] = await Promise.all(
      ["Centro", "Norte"].map((name, index) =>
        db.branch.create({
          data: { organizationId: org.id, name, code: `R${index}` },
        }),
      ),
    );
    const owner = await user(
      org.id,
      ["REPORT_READ", "REPORT_PROFIT_READ"],
      [centro!.id, norte!.id],
    );
    const category = await db.category.create({
      data: { organizationId: org.id, name: "Analgésicos" },
    });
    const product = await db.product.create({
      data: {
        organizationId: org.id,
        name: "Producto A",
        categoryId: category.id,
      },
    });
    const lot = await db.productLot.create({
      data: {
        organizationId: org.id,
        branchId: centro!.id,
        productId: product.id,
        number: "L1",
        quantity: 3,
        unitCostMinor: 400n,
        expiresAt: new Date("2026-12-01"),
      },
    });
    const register = await db.cashRegister.create({
      data: { branchId: centro!.id, name: "Caja 1" },
    });
    const session = await db.cashSession.create({
      data: {
        cashRegisterId: register.id,
        openedById: owner,
        openingAmountMinor: 1000n,
        openedAt: new Date("2026-10-10T11:00:00Z"),
        closedAt: new Date("2026-10-10T23:00:00Z"),
        closingAmountMinor: 2400n,
      },
    });
    await db.cashMovement.create({
      data: {
        cashSessionId: session.id,
        type: "OUT",
        amountMinor: 500n,
        reason: "Vuelto",
        actorId: owner,
      },
    });
    const sale = (data: {
      branchId: string;
      status?: "COMPLETED" | "CANCELLED";
      completedAt: string;
      totalMinor: bigint;
      items: {
        productId?: string;
        description?: string;
        lotId?: string;
        quantity: number;
        unitPriceMinor: bigint;
      }[];
      payments: {
        method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT";
        amountMinor: bigint;
        cashSessionId?: string;
      }[];
    }) =>
      db.sale.create({
        data: {
          organizationId: org.id,
          branchId: data.branchId,
          status: data.status ?? "COMPLETED",
          totalMinor: data.totalMinor,
          completedAt: new Date(data.completedAt),
          items: { create: data.items },
          payments: { create: data.payments },
        },
        include: { items: true },
      });
    const v1 = await sale({
      branchId: centro!.id,
      completedAt: "2026-10-10T13:00:00Z",
      totalMinor: 3000n,
      items: [
        {
          productId: product.id,
          lotId: lot.id,
          quantity: 3,
          unitPriceMinor: 1000n,
        },
      ],
      payments: [
        { method: "CASH", amountMinor: 2000n, cashSessionId: session.id },
        { method: "TRANSFER", amountMinor: 1500n, cashSessionId: session.id },
      ],
    });
    await sale({
      branchId: norte!.id,
      completedAt: "2026-10-20T13:00:00Z",
      totalMinor: 1000n,
      items: [
        { description: "Concepto manual", quantity: 1, unitPriceMinor: 1000n },
      ],
      payments: [{ method: "CARD", amountMinor: 1000n }],
    });
    await sale({
      branchId: centro!.id,
      completedAt: "2026-11-01T02:59:00Z",
      totalMinor: 1000n,
      items: [
        {
          productId: product.id,
          lotId: lot.id,
          quantity: 1,
          unitPriceMinor: 1000n,
        },
      ],
      payments: [{ method: "ACCOUNT", amountMinor: 1000n }],
    });
    await sale({
      branchId: centro!.id,
      status: "CANCELLED",
      completedAt: "2026-10-12T13:00:00Z",
      totalMinor: 9999n,
      items: [{ productId: product.id, quantity: 9, unitPriceMinor: 1111n }],
      payments: [{ method: "CASH", amountMinor: 9999n }],
    });
    await sale({
      branchId: centro!.id,
      completedAt: "2026-11-01T03:00:00Z",
      totalMinor: 7777n,
      items: [{ productId: product.id, quantity: 7, unitPriceMinor: 1111n }],
      payments: [{ method: "CASH", amountMinor: 7777n }],
    });
    await sale({
      branchId: centro!.id,
      completedAt: "2026-09-15T13:00:00Z",
      totalMinor: 2000n,
      items: [
        {
          productId: product.id,
          lotId: lot.id,
          quantity: 1,
          unitPriceMinor: 2000n,
        },
      ],
      payments: [{ method: "CASH", amountMinor: 2000n }],
    });
    await db.customerReturn.create({
      data: {
        organizationId: org.id,
        branchId: centro!.id,
        saleId: v1.id,
        actorId: owner,
        reason: "Devolucion",
        createdAt: new Date("2026-10-25T13:00:00Z"),
        items: { create: { saleItemId: v1.items[0]!.id, quantity: 1 } },
      },
    });
    return { org, centro: centro!, norte: norte!, owner };
  }

  it("KPIs con devoluciones, anuladas, limites de dia y comparacion", async () => {
    const result = await reports.overview(
      fixture.owner,
      fixture.org.id,
      october,
      now,
    );
    expect(result.kpis.netSales).toMatchObject({
      value: "4000",
      previous: "2000",
      changePct: 100,
    });
    expect(result.kpis.averageTicket.value).toBe("1667");
    expect(result.kpis.unitsSold).toMatchObject({ value: "3", previous: "1" });
    expect(result.kpis.grossProfit).toMatchObject({
      value: "1800",
      previous: "1600",
      changePct: 12.5,
      estimated: true,
    });
    expect(result.meta.dataQuality.warnings[0]).toContain("75");
  });

  it("pago mixto con vuelto: los medios suman lo facturado, nunca el doble", async () => {
    const result = await reports.overview(
      fixture.owner,
      fixture.org.id,
      october,
      now,
    );
    const methods = Object.fromEntries(
      result.charts.paymentMethods.map((item) => [item.id, item.value]),
    );
    expect(methods).toEqual({
      CASH: "1500",
      TRANSFER: "1500",
      CARD: "1000",
      ACCOUNT: "1000",
    });
  });

  it("graficos y tabla concilian con los KPIs", async () => {
    const result = await reports.overview(
      fixture.owner,
      fixture.org.id,
      october,
      now,
    );
    const sum = (values: string[]) =>
      values.reduce((total, value) => total + BigInt(value), 0n).toString();
    expect(result.charts.salesTrend).toHaveLength(31);
    expect(sum(result.charts.salesTrend.map((point) => point.value))).toBe(
      "4000",
    );
    expect(sum(result.charts.salesByCategory.map((item) => item.value))).toBe(
      "4000",
    );
    expect(result.charts.salesByCategory.map((item) => item.name)).toEqual([
      "Analgésicos",
      "Conceptos manuales",
    ]);
    expect(sum(result.tables.branches.map((row) => row.netSalesMinor))).toBe(
      "4000",
    );
    expect(
      result.tables.branches.map((row) => [
        row.name,
        row.netSalesMinor,
        row.tickets,
        row.sharePct,
      ]),
    ).toEqual([
      ["Centro", "3000", 2, 75],
      ["Norte", "1000", 1, 25],
    ]);
    expect(result.charts.topProducts).toEqual([
      expect.objectContaining({ name: "Producto A", units: 3, value: "3000" }),
    ]);
  });

  it("alertas y cierres de caja", async () => {
    const result = await reports.overview(
      fixture.owner,
      fixture.org.id,
      october,
      now,
    );
    expect(result.tables.alerts).toEqual([
      { kind: "expired", count: 0, threshold: 0 },
      { kind: "expiring", count: 1, threshold: 90 },
      { kind: "lowStock", count: 1, threshold: 5 },
    ]);
    // Esperado: 1000 fondo + 2000 efectivo cobrado − 500 vuelto = 2500; contado 2400.
    expect(result.tables.cashClosures).toMatchObject({
      count: 1,
      expectedMinor: "2500",
      countedMinor: "2400",
      differenceMinor: "-100",
    });
  });

  it("sin permiso de costos no envia ganancia", async () => {
    const limited = await user(
      fixture.org.id,
      ["REPORT_READ"],
      [fixture.centro.id, fixture.norte.id],
    );
    const result = await reports.overview(
      limited,
      fixture.org.id,
      october,
      now,
    );
    expect(result.kpis.grossProfit).toMatchObject({
      available: false,
      unavailableReason: "FORBIDDEN",
      value: null,
    });
    expect(
      result.tables.branches.every((row) => row.grossProfitMinor === null),
    ).toBe(true);
    expect(result.meta.dataQuality.warnings).toEqual([]);
  });

  it("un usuario de una sola sucursal ve solo esa", async () => {
    const single = await user(
      fixture.org.id,
      ["REPORT_READ"],
      [fixture.centro.id],
    );
    const result = await reports.overview(
      single,
      fixture.org.id,
      { ...october, branchId: "all" },
      now,
    );
    expect(result.meta.branchIds).toEqual([fixture.centro.id]);
    expect(result.kpis.netSales.value).toBe("3000");
  });

  it("rechaza filtros que el Resumen no usa", async () => {
    await expect(
      reports.overview(
        fixture.owner,
        fixture.org.id,
        { ...october, staleDays: 30 },
        now,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
