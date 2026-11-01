import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dashboardDays } from "./dashboard-days";
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async summary(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId);
    const days = dashboardDays();
    const today = days[6]!;
    const start = today.start;
    const limit = new Date();
    limit.setDate(limit.getDate() + 90);
    const [sales, lots, expiring, purchases, registers, ...history] =
      await this.prisma.$transaction([
        this.prisma.sale.aggregate({
          where: {
            organizationId,
            branchId,
            status: "COMPLETED",
            completedAt: { gte: start, lt: today.end },
          },
          _sum: { totalMinor: true },
          _count: true,
        }),
        this.prisma.productLot.aggregate({
          where: { organizationId, branchId, quantity: { gt: 0 } },
          _sum: { quantity: true },
          _count: true,
        }),
        this.prisma.productLot.count({
          where: {
            organizationId,
            branchId,
            quantity: { gt: 0 },
            expiresAt: { lte: limit },
          },
        }),
        this.prisma.purchase.count({
          where: {
            organizationId,
            branchId,
            status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
          },
        }),
        this.prisma.cashSession.count({
          where: {
            closedAt: null,
            cashRegisterId: {
              in: (
                await this.prisma.cashRegister.findMany({
                  where: { branchId },
                  select: { id: true },
                })
              ).map((register) => register.id),
            },
          },
        }),
        ...days.slice(0, 6).map((day) =>
          this.prisma.sale.aggregate({
            where: {
              organizationId,
              branchId,
              status: "COMPLETED",
              completedAt: { gte: day.start, lt: day.end },
            },
            _sum: { totalMinor: true },
            _count: true,
          }),
        ),
      ]);
    return {
      salesTodayCount: sales._count,
      salesTodayMinor: (sales._sum.totalMinor ?? 0n).toString(),
      salesTrend: [...history, sales].map((day, index) => ({
        date: days[index]!.date,
        totalMinor: (day._sum.totalMinor ?? 0n).toString(),
        count: day._count,
      })),
      stockLots: lots._count,
      stockUnits: lots._sum.quantity ?? 0,
      expiringLots: expiring,
      pendingPurchases: purchases,
      openCashSessions: registers,
    };
  }
  async detail(
    actorId: string,
    organizationId: string,
    branchId: string,
    from?: string,
    to?: string,
  ) {
    await this.assert(actorId, organizationId);
    const start = from
      ? new Date(`${from}T00:00:00.000-03:00`)
      : new Date(Date.now() - 29 * 86400000);
    const end = to ? new Date(`${to}T23:59:59.999-03:00`) : new Date();
    if (
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      start > end
    )
      throw new ForbiddenException("The report date range is invalid.");
    const salesWhere = {
      organizationId,
      branchId,
      status: "COMPLETED" as const,
      completedAt: { gte: start, lte: end },
    };
    const registerIds = (
      await this.prisma.cashRegister.findMany({
        where: { branchId },
        select: { id: true },
      })
    ).map((register) => register.id);
    const [
      sales,
      payments,
      productLines,
      lots,
      expiring,
      closures,
      soldUnits,
      returnedUnits,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: salesWhere,
        select: { completedAt: true, totalMinor: true },
        orderBy: { completedAt: "asc" },
      }),
      this.prisma.salePayment.groupBy({
        by: ["method"],
        where: { sale: salesWhere },
        _sum: { amountMinor: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: salesWhere, productId: { not: null } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      }),
      this.prisma.productLot.findMany({
        where: { organizationId, branchId, quantity: { gt: 0 } },
        select: { productId: true, quantity: true, unitCostMinor: true },
      }),
      this.prisma.productLot.findMany({
        where: {
          organizationId,
          branchId,
          quantity: { gt: 0 },
          expiresAt: { not: null, lte: new Date(Date.now() + 90 * 86400000) },
        },
        select: {
          productId: true,
          number: true,
          quantity: true,
          expiresAt: true,
        },
        orderBy: { expiresAt: "asc" },
        take: 20,
      }),
      this.prisma.cashSession.findMany({
        where: {
          closedAt: { not: null, gte: start, lte: end },
          cashRegisterId: { in: registerIds },
        },
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          openingAmountMinor: true,
          closingAmountMinor: true,
          movements: { select: { type: true, amountMinor: true } },
        },
      }),
      // Unidades vendidas (REPORTS_PLAN.md): lineas con producto de ventas
      // confirmadas, menos las devueltas en el periodo. Sin conceptos manuales.
      this.prisma.saleItem.aggregate({
        where: { sale: salesWhere, productId: { not: null } },
        _sum: { quantity: true },
      }),
      this.prisma.customerReturnItem.aggregate({
        where: {
          customerReturn: {
            organizationId,
            branchId,
            createdAt: { gte: start, lte: end },
          },
          saleItem: { productId: { not: null } },
        },
        _sum: { quantity: true },
      }),
    ]);
    const closurePayments = closures.length
      ? await this.prisma.salePayment.groupBy({
          by: ["cashSessionId"],
          where: {
            cashSessionId: { in: closures.map((closure) => closure.id) },
            method: "CASH",
            sale: { status: "COMPLETED" },
          },
          _sum: { amountMinor: true },
        })
      : [];
    const productIds = [
      ...new Set(
        [...productLines, ...expiring].flatMap((item) =>
          item.productId ? [item.productId] : [],
        ),
      ),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const daily = new Map<string, bigint>();
    for (const sale of sales) {
      const day = this.dateKey(sale.completedAt!);
      daily.set(day, (daily.get(day) ?? 0n) + sale.totalMinor);
    }
    const cashBySession = new Map(
      closurePayments.map((payment) => [
        payment.cashSessionId,
        payment._sum.amountMinor ?? 0n,
      ]),
    );
    const dailyClosures = new Map<
      string,
      {
        count: number;
        expectedMinor: bigint;
        countedMinor: bigint;
        differenceMinor: bigint;
      }
    >();
    const monthlyClosures = new Map<
      string,
      {
        count: number;
        expectedMinor: bigint;
        countedMinor: bigint;
        differenceMinor: bigint;
      }
    >();
    for (const closure of closures) {
      const manualIn = closure.movements.reduce(
        (sum, movement) =>
          sum + (movement.type === "IN" ? movement.amountMinor : 0n),
        0n,
      );
      const manualOut = closure.movements.reduce(
        (sum, movement) =>
          sum + (movement.type === "OUT" ? movement.amountMinor : 0n),
        0n,
      );
      const expected =
        closure.openingAmountMinor +
        (cashBySession.get(closure.id) ?? 0n) +
        manualIn -
        manualOut;
      const counted = closure.closingAmountMinor ?? 0n;
      const difference = counted - expected;
      const day = this.dateKey(closure.closedAt!);
      const month = day.slice(0, 7);
      for (const [key, target] of [
        [day, dailyClosures],
        [month, monthlyClosures],
      ] as const) {
        const previous = target.get(key) ?? {
          count: 0,
          expectedMinor: 0n,
          countedMinor: 0n,
          differenceMinor: 0n,
        };
        target.set(key, {
          count: previous.count + 1,
          expectedMinor: previous.expectedMinor + expected,
          countedMinor: previous.countedMinor + counted,
          differenceMinor: previous.differenceMinor + difference,
        });
      }
    }
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      totalSalesMinor: sales
        .reduce((sum, sale) => sum + sale.totalMinor, 0n)
        .toString(),
      saleCount: sales.length,
      unitsSold:
        (soldUnits._sum.quantity ?? 0) - (returnedUnits._sum.quantity ?? 0),
      dailySales: [...daily].map(([date, totalMinor]) => ({
        date,
        totalMinor: totalMinor.toString(),
      })),
      cashClosures: {
        count: closures.length,
        expectedMinor: [...dailyClosures.values()]
          .reduce((sum, item) => sum + item.expectedMinor, 0n)
          .toString(),
        countedMinor: [...dailyClosures.values()]
          .reduce((sum, item) => sum + item.countedMinor, 0n)
          .toString(),
        differenceMinor: [...dailyClosures.values()]
          .reduce((sum, item) => sum + item.differenceMinor, 0n)
          .toString(),
        daily: this.serializeClosureGroups(dailyClosures),
        monthly: this.serializeClosureGroups(monthlyClosures),
      },
      payments: payments.map((payment) => ({
        method: payment.method,
        amountMinor: (payment._sum.amountMinor ?? 0n).toString(),
      })),
      topProducts: productLines.map((item) => ({
        productId: item.productId,
        productName: item.productId
          ? (names.get(item.productId) ?? "Producto")
          : "Conceptos fuera de catálogo",
        quantity: item._sum.quantity ?? 0,
      })),
      stockCostMinor: lots
        .reduce(
          (sum, lot) => sum + lot.unitCostMinor * BigInt(lot.quantity),
          0n,
        )
        .toString(),
      expiring: expiring.map((lot) => ({
        productName: names.get(lot.productId) ?? "Producto",
        lotNumber: lot.number,
        quantity: lot.quantity,
        expiresAt: lot.expiresAt,
      })),
    };
  }
  private dateKey(date: Date) {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }
  private serializeClosureGroups(
    groups: Map<
      string,
      {
        count: number;
        expectedMinor: bigint;
        countedMinor: bigint;
        differenceMinor: bigint;
      }
    >,
  ) {
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, item]) => ({
        period,
        count: item.count,
        expectedMinor: item.expectedMinor.toString(),
        countedMinor: item.countedMinor.toString(),
        differenceMinor: item.differenceMinor.toString(),
      }));
  }
  private async assert(actorId: string, organizationId: string) {
    const member = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !member?.active ||
      !member.roles.some(({ role }) =>
        role.permissions.some(
          ({ permission }) => permission.code === "REPORT_READ",
        ),
      )
    )
      throw new ForbiddenException("You do not have permission.");
  }
}
