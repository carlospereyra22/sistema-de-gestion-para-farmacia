import { ReportsService } from "./reports.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CashService } from "../cash/cash.service";

describe("dashboard summary series", () => {
  afterEach(() => jest.useRealTimers());
  it("scopes all seven completed-sale aggregates and returns today's total in the same series", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const aggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { totalMinor: 12000n }, _count: 3 });
    const prisma = {
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          roles: [
            {
              role: {
                permissions: [{ permission: { code: "REPORT_READ" } }],
              },
            },
          ],
        }),
      },
      sale: { aggregate },
      productLot: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { quantity: 2 }, _count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      purchase: { count: jest.fn().mockResolvedValue(0) },
      cashRegister: { findMany: jest.fn().mockResolvedValue([]) },
      cashSession: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn((sql: TemplateStringsArray) =>
        Promise.resolve(
          sql.join("").includes("CustomerAccountMovement")
            ? [{ saldo: 2500n }, { saldo: -100n }]
            : [
                {
                  invoiceId: "factura",
                  dueOn: new Date("2026-10-10"),
                  saldo: 700n,
                },
              ],
        ),
      ),
      $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const cajas = [
      { id: "c1", name: "Caja 1", open: true, expectedAmountMinor: "5000" },
      { id: "c2", name: "Caja 2", open: false, expectedAmountMinor: null },
    ];
    const branchRegistersStatus = jest.fn().mockResolvedValue(cajas);
    const result = await new ReportsService(
      prisma as unknown as PrismaService,
      { branchRegistersStatus } as unknown as CashService,
    ).summary("user", "org", "branch");
    expect(branchRegistersStatus).toHaveBeenCalledWith("branch");
    expect(result.cashRegisters).toEqual(cajas);
    expect(aggregate).toHaveBeenCalledTimes(7);
    for (const [args] of aggregate.mock.calls) {
      expect(args.where).toMatchObject({
        organizationId: "org",
        branchId: "branch",
        status: "COMPLETED",
      });
      expect(
        args.where.completedAt.lt.getTime() -
          args.where.completedAt.gte.getTime(),
      ).toBe(86400000);
    }
    expect(result.averageTicketMinor).toBe("4000");
    expect(result.customerReceivables).toEqual({
      count: 1,
      totalMinor: "2500",
    });
    expect(result.supplierDebt).toMatchObject({
      count: 1,
      overdueMinor: "700",
    });
    expect(result.salesTrend).toHaveLength(7);
    expect(result.salesTrend[0]!.date).toBe("2026-10-08");
    expect(result.salesTrend[6]).toEqual({
      date: "2026-10-14",
      totalMinor: result.salesTodayMinor,
      count: result.salesTodayCount,
    });
  });
  it("does not query sales without report permission", async () => {
    const aggregate = jest.fn();
    const prisma = {
      userOrganization: { findUnique: jest.fn().mockResolvedValue(null) },
      sale: { aggregate },
    };
    await expect(
      new ReportsService(prisma as unknown as PrismaService).summary(
        "user",
        "org",
        "branch",
      ),
    ).rejects.toThrow("No tenés permiso");
    expect(aggregate).not.toHaveBeenCalled();
  });
});
