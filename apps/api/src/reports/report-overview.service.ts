import { BadRequestException, Injectable } from "@nestjs/common";
import {
  REPORT_DEFAULTS,
  type ReportBreakdownItem,
  type ReportOverview,
} from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import { cashClosureSummary } from "./report-cash-closures";
import type { ReportFiltersQuery } from "./report-filters.dto";
import {
  divideRounded,
  kpi,
  sharePct,
  trendBuckets,
  trendGranularity,
  unavailableKpi,
} from "./report-math";
import { argentineDate, type ReportRange } from "./report-period";
import {
  emptyTotals,
  netOf,
  profitOf,
  ReportSalesData,
  returnsWhere,
  salesWhere,
  sumTotals,
  TZ,
} from "./report-sales-data";

/** Filtros que el Resumen no usa: se rechazan en vez de ignorarlos en silencio. */
const unsupported = [
  "categoryIds",
  "laboratoryIds",
  "supplierIds",
  "paymentMethods",
  "granularity",
  "staleDays",
] as const;

/**
 * Pestana Resumen. Todas las cifras salen de las mismas consultas por sucursal, asi
 * los KPIs concilian con la tabla por sucursal. Formulas: docs/REPORTS_PLAN.md.
 */
@Injectable()
export class ReportOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
    private readonly salesData: ReportSalesData,
  ) {}

  async overview(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportOverview> {
    const filter = unsupported.find((key) => query[key] !== undefined);
    if (filter)
      throw new BadRequestException(
        `El Resumen no admite el filtro ${filter}.`,
      );
    const scope = await this.access.scope(actorId, organizationId, query, now);
    const { period, branchIds, access } = scope;
    const sales = (range: ReportRange) =>
      salesWhere(organizationId, branchIds, range);
    const returns = (range: ReportRange) =>
      returnsWhere(organizationId, branchIds, range);

    const granularity = trendGranularity(period);
    const today = argentineDate(now);
    const lowStock =
      query.lowStockThreshold ?? REPORT_DEFAULTS.lowStockThreshold;
    const expiryDays =
      query.expiryWindowDays ?? REPORT_DEFAULTS.expiryWindowDays;

    const [
      current,
      previous,
      trend,
      previousTrend,
      categories,
      payments,
      products,
      alerts,
      branches,
      cashClosures,
    ] = await Promise.all([
      this.salesData.branchTotals(sales(period), returns(period)),
      period.previous
        ? this.salesData.branchTotals(
            sales(period.previous),
            returns(period.previous),
          )
        : null,
      this.salesData.trend(sales(period), returns(period), granularity),
      period.previous
        ? this.salesData.trend(
            sales(period.previous),
            returns(period.previous),
            granularity,
          )
        : null,
      this.salesData.categories(organizationId, sales(period), returns(period)),
      this.salesData.payments(sales(period)),
      this.salesData.topProducts(sales(period), returns(period), 10),
      this.alerts(branchIds, today, lowStock, expiryDays),
      this.prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      cashClosureSummary(this.prisma, branchIds, {
        gte: period.start,
        lt: period.end,
      }),
    ]);

    const total = sumTotals(current.values());
    const before = previous ? sumTotals(previous.values()) : null;
    const profit = profitOf;
    const net = netOf;

    const warnings: string[] = [];
    if (access.profitability && net(total) > 0n) {
      const coverage = sharePct(total.costedSales, net(total)) ?? 0;
      if (coverage < 100)
        warnings.push(
          `Ganancia estimada sobre el ${coverage.toLocaleString("es-AR")} % de las ventas: el resto no tiene costo de lote (conceptos manuales).`,
        );
    }

    const breakdown = (
      rows: { id: string | null; name: string; value: bigint }[],
    ): ReportBreakdownItem[] => {
      const whole = rows.reduce((acc, row) => acc + row.value, 0n);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        value: row.value.toString(),
        sharePct: sharePct(row.value, whole),
      }));
    };

    const buckets = trendBuckets(period, granularity);
    const previousBuckets = period.previous
      ? trendBuckets(period.previous, granularity)
      : [];

    return {
      meta: {
        report: "summary",
        currency: "ARS",
        timezone: TZ,
        from: period.from,
        to: period.to,
        comparison: period.comparison,
        previousFrom: period.previous?.from ?? null,
        previousTo: period.previous?.to ?? null,
        branchIds,
        generatedAt: now.toISOString(),
        dataQuality: { partial: warnings.length > 0, warnings },
      },
      kpis: {
        netSales: kpi("money", net(total), before ? net(before) : null),
        grossProfit: access.profitability
          ? kpi("money", profit(total), before ? profit(before) : null, {
              estimated: true,
            })
          : unavailableKpi("money", "FORBIDDEN"),
        averageTicket: total.tickets
          ? kpi(
              "money",
              divideRounded(total.invoiced, total.tickets)!,
              before?.tickets
                ? divideRounded(before.invoiced, before.tickets)
                : null,
            )
          : unavailableKpi("money", "NO_DATA"),
        unitsSold: kpi("units", total.units, before?.units ?? null),
      },
      charts: {
        trendGranularity: granularity,
        salesTrend: buckets.map((bucket, index) => ({
          bucket,
          value: (trend.get(bucket)?.amount ?? 0n).toString(),
          previous: previousTrend
            ? (
                previousTrend.get(previousBuckets[index] ?? "")?.amount ?? 0n
              ).toString()
            : null,
        })),
        salesByCategory: breakdown(categories),
        paymentMethods: breakdown(
          payments.map((row) => ({
            id: row.method,
            name: row.method,
            value: row.amount,
          })),
        ),
        topProducts: products.map((product) => ({
          id: product.id,
          name: product.name,
          value: product.amount.toString(),
          sharePct: sharePct(product.amount, net(total)),
          units: product.units,
        })),
      },
      tables: {
        branches: branches.map((branch) => {
          const row = current.get(branch.id) ?? emptyTotals();
          return {
            id: branch.id,
            name: branch.name,
            netSalesMinor: net(row).toString(),
            grossProfitMinor: access.profitability
              ? profit(row).toString()
              : null,
            tickets: row.tickets,
            unitsSold: row.units,
            sharePct: sharePct(net(row), net(total)),
          };
        }),
        alerts,
        cashClosures,
      },
    };
  }

  /**
   * Alertas actuales (no dependen del periodo): lotes vencidos y por vencer con
   * existencia, y productos activos con stock vendible entre 1 y el umbral.
   */
  private async alerts(
    branchIds: string[],
    today: string,
    lowStock: number,
    expiryDays: number,
  ): Promise<ReportOverview["tables"]["alerts"]> {
    const [[lots], [stock]] = await Promise.all([
      this.prisma.$queryRaw<{ expired: number; expiring: number }[]>`
        SELECT
          count(*) FILTER (WHERE "expiresAt" < ${today}::date)::int AS expired,
          count(*) FILTER (WHERE "expiresAt" >= ${today}::date
            AND "expiresAt" <= ${today}::date + ${expiryDays}::int)::int AS expiring
        FROM "ProductLot"
        WHERE "branchId" = ANY(${branchIds}::uuid[]) AND quantity > 0`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM (
          SELECT pl."branchId", pl."productId"
          FROM "ProductLot" pl JOIN "Product" p ON p.id = pl."productId" AND p.active
          WHERE pl."branchId" = ANY(${branchIds}::uuid[]) AND pl.quantity > 0
            AND (pl."expiresAt" IS NULL OR pl."expiresAt" >= ${today}::date)
          GROUP BY 1, 2 HAVING sum(pl.quantity) <= ${lowStock}::int
        ) low`,
    ]);
    return [
      { kind: "expired", count: lots?.expired ?? 0, threshold: 0 },
      { kind: "expiring", count: lots?.expiring ?? 0, threshold: expiryDays },
      { kind: "lowStock", count: stock?.count ?? 0, threshold: lowStock },
    ];
  }
}
