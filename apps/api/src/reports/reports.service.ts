import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { cashClosureSummary } from "./report-cash-closures";
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
    const [
      sales,
      payments,
      productLines,
      lots,
      expiring,
      cashClosures,
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
      cashClosureSummary(this.prisma, [branchId], { gte: start, lte: end }),
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
      cashClosures,
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
