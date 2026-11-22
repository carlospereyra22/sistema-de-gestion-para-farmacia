import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ReportBreakdownItem,
  ReportSales,
  ReportSalesTrendUnit,
} from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import {
  changePct,
  divideRounded,
  kpi,
  sharePct,
  trendBuckets,
  trendGranularity,
  unavailableKpi,
} from "./report-math";
import type { ReportRange } from "./report-period";
import {
  emptyTotals,
  netOf,
  ReportSalesData,
  RETURNED,
  returnsWhere,
  salesWhere,
  sumTotals,
  TZ,
} from "./report-sales-data";
import { byWeekday, highlight, unitsPerTicket } from "./report-sales-insights";

/** Filtros que Ventas todavía no usa: se rechazan en vez de ignorarlos. */
const unsupported = [
  "categoryIds",
  "laboratoryIds",
  "supplierIds",
  "paymentMethods",
  "staleDays",
  "lowStockThreshold",
  "expiryWindowDays",
] as const;

/** Tope de sucursales con línea propia en la evolución: más no se leen. */
const BRANCH_LINES = 8;

/**
 * Pestaña Ventas (SISTEMA-115). Ventas netas, tickets, ticket promedio y
 * unidades salen de las mismas consultas que el Resumen (`ReportSalesData`),
 * así las dos pestañas dan las mismas cifras. Fórmulas: docs/REPORTS_PLAN.md.
 */
@Injectable()
export class ReportSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
    private readonly salesData: ReportSalesData,
  ) {}

  async sales(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportSales> {
    const filter = unsupported.find((key) => query[key] !== undefined);
    if (filter)
      throw new BadRequestException(`Ventas no admite el filtro ${filter}.`);
    if (query.granularity === "hour")
      throw new BadRequestException(
        "La evolución se agrupa por día, semana o mes; las horas tienen su propio gráfico.",
      );
    const { period, branchIds } = await this.access.scope(
      actorId,
      organizationId,
      query,
      now,
    );
    const unit: ReportSalesTrendUnit =
      query.granularity ?? trendGranularity(period);
    const sales = (range: ReportRange) =>
      salesWhere(organizationId, branchIds, range);
    const returns = (range: ReportRange) =>
      returnsWhere(organizationId, branchIds, range);
    const previous = period.previous;
    const severalBranches = branchIds.length > 1;

    const [
      current,
      before,
      trend,
      previousTrend,
      branchTrend,
      hours,
      previousHours,
      heatmap,
      categories,
      payments,
      topProducts,
      discounts,
      previousDiscounts,
      branches,
    ] = await Promise.all([
      this.salesData.branchTotals(sales(period), returns(period)),
      previous
        ? this.salesData.branchTotals(sales(previous), returns(previous))
        : null,
      this.salesData.trend(sales(period), returns(period), unit),
      previous
        ? this.salesData.trend(sales(previous), returns(previous), unit)
        : null,
      severalBranches
        ? this.branchTrend(sales(period), returns(period), unit)
        : null,
      this.hours(sales(period)),
      previous ? this.hours(sales(previous)) : null,
      this.heatmap(sales(period)),
      this.salesData.categories(organizationId, sales(period), returns(period)),
      this.salesData.payments(sales(period)),
      this.salesData.topProducts(sales(period), returns(period), 40),
      this.discounts(sales(period)),
      previous ? this.discounts(sales(previous)) : null,
      this.prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const total = sumTotals(current.values());
    const prior = before ? sumTotals(before.values()) : null;
    const buckets = trendBuckets(period, unit);
    const previousBuckets = previous ? trendBuckets(previous, unit) : [];

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

    const netBy = new Map(
      branches.map((branch) => [
        branch.id,
        netOf(current.get(branch.id) ?? emptyTotals()),
      ]),
    );
    const branchRows = branches.map((branch) => {
      const row = current.get(branch.id) ?? emptyTotals();
      const old = before ? (before.get(branch.id) ?? emptyTotals()) : null;
      return {
        id: branch.id,
        name: branch.name,
        netSalesMinor: netOf(row).toString(),
        previousNetSalesMinor: old ? netOf(old).toString() : null,
        changePct: old ? changePct(netOf(row), netOf(old)) : null,
        tickets: row.tickets,
        averageTicketMinor: row.tickets
          ? divideRounded(row.invoiced, row.tickets)!.toString()
          : null,
        unitsSold: row.units,
        sharePct: sharePct(netOf(row), netOf(total)),
      };
    });
    const leader = severalBranches
      ? highlight(
          branchRows.map((row) => ({ ...row, amount: netBy.get(row.id)! })),
        )
      : null;
    const peak = highlight(
      hours.map((row) => ({ ...row, amount: row.amount })),
    );
    const weekday = highlight(byWeekday(heatmap));

    return {
      meta: {
        report: "sales",
        currency: "ARS",
        timezone: TZ,
        from: period.from,
        to: period.to,
        comparison: period.comparison,
        previousFrom: previous?.from ?? null,
        previousTo: previous?.to ?? null,
        branchIds,
        generatedAt: now.toISOString(),
        dataQuality: { partial: false, warnings: [] },
      },
      kpis: {
        netSales: kpi("money", netOf(total), prior ? netOf(prior) : null),
        tickets: kpi("count", total.tickets, prior?.tickets ?? null),
        averageTicket: total.tickets
          ? kpi(
              "money",
              divideRounded(total.invoiced, total.tickets)!,
              prior?.tickets
                ? divideRounded(prior.invoiced, prior.tickets)
                : null,
            )
          : unavailableKpi("money", "NO_DATA"),
        unitsSold: kpi("units", total.units, prior?.units ?? null),
      },
      charts: {
        trendUnit: unit,
        trend: buckets.map((bucket, index) => {
          const old = previousTrend?.get(previousBuckets[index] ?? "");
          return {
            bucket,
            value: (trend.get(bucket)?.amount ?? 0n).toString(),
            previous: previousTrend ? (old?.amount ?? 0n).toString() : null,
            tickets: trend.get(bucket)?.tickets ?? 0,
            previousTickets: previousTrend ? (old?.tickets ?? 0) : null,
          };
        }),
        branchTrend: branchTrend
          ? branchRows
              .slice()
              .sort((left, right) =>
                netBy.get(right.id)! > netBy.get(left.id)! ? 1 : -1,
              )
              .slice(0, BRANCH_LINES)
              .map((branch) => ({
                id: branch.id,
                name: branch.name,
                values: buckets.map((bucket) =>
                  (branchTrend.get(`${branch.id}|${bucket}`) ?? 0n).toString(),
                ),
              }))
          : [],
        byHour: Array.from({ length: 24 }, (_, hour) => {
          const row = hours.find((item) => item.hour === hour);
          const old = previousHours?.find((item) => item.hour === hour);
          return {
            hour,
            amountMinor: (row?.amount ?? 0n).toString(),
            tickets: row?.tickets ?? 0,
            previousAmountMinor: previousHours
              ? (old?.amount ?? 0n).toString()
              : null,
          };
        }),
        heatmap: heatmap.map((cell) => ({
          weekday: cell.weekday,
          hour: cell.hour,
          amountMinor: cell.amount.toString(),
          tickets: cell.tickets,
        })),
        paymentMethods: breakdown(
          payments.map((row) => ({
            id: row.method,
            name: row.method,
            value: row.amount,
          })),
        ),
        topProducts: topProducts.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.amount.toString(),
          sharePct: sharePct(row.amount, netOf(total)),
          units: row.units,
        })),
        categories: categories.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.value.toString(),
          sharePct: sharePct(row.value, netOf(total)),
          units: row.units,
        })),
      },
      tables: {
        branches: branchRows,
        insights: {
          peakHour: peak
            ? {
                hour: peak.row.hour,
                amountMinor: peak.row.amount.toString(),
                sharePct: peak.sharePct,
              }
            : null,
          bestWeekday: weekday
            ? {
                weekday: weekday.row.weekday,
                amountMinor: weekday.row.amount.toString(),
                sharePct: weekday.sharePct,
              }
            : null,
          topBranch: leader
            ? {
                id: leader.row.id,
                name: leader.row.name,
                sharePct: leader.sharePct,
              }
            : null,
          discounts: kpi("money", discounts, previousDiscounts),
          returns: kpi("money", total.returned, prior?.returned ?? null),
          returnRatePct: sharePct(total.returned, total.invoiced),
          unitsPerTicket: unitsPerTicket(total.units, total.tickets),
        },
      },
    };
  }

  /** Ventas netas por sucursal y tramo; clave `sucursal|tramo`. */
  private async branchTrend(
    sales: Prisma.Sql,
    returns: Prisma.Sql,
    unit: ReportSalesTrendUnit,
  ) {
    const [invoiced, returned] = await Promise.all([
      this.prisma.$queryRaw<
        { branchId: string; bucket: string; amount: bigint }[]
      >`
        SELECT s."branchId" AS "branchId",
          to_char(date_trunc(${unit}, s."completedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(s."totalMinor")::bigint AS amount
        FROM "Sale" s WHERE ${sales} GROUP BY 1, 2`,
      this.prisma.$queryRaw<
        { branchId: string; bucket: string; amount: bigint }[]
      >`
        SELECT cr."branchId" AS "branchId",
          to_char(date_trunc(${unit}, cr."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        WHERE ${returns} GROUP BY 1, 2`,
    ]);
    const values = new Map<string, bigint>();
    for (const row of invoiced)
      values.set(`${row.branchId}|${row.bucket}`, row.amount);
    for (const row of returned) {
      const key = `${row.branchId}|${row.bucket}`;
      values.set(key, (values.get(key) ?? 0n) - row.amount);
    }
    return values;
  }

  /** Facturado y tickets por hora local de confirmación. */
  private hours(sales: Prisma.Sql) {
    return this.prisma.$queryRaw<
      { hour: number; amount: bigint; tickets: number }[]
    >`
      SELECT extract(hour FROM s."completedAt" AT TIME ZONE ${TZ})::int AS hour,
        sum(s."totalMinor")::bigint AS amount, count(*)::int AS tickets
      FROM "Sale" s WHERE ${sales} GROUP BY 1`;
  }

  /** Facturado y tickets por día de la semana (1 = lunes) y hora local. */
  private heatmap(sales: Prisma.Sql) {
    return this.prisma.$queryRaw<
      { weekday: number; hour: number; amount: bigint; tickets: number }[]
    >`
      SELECT extract(isodow FROM s."completedAt" AT TIME ZONE ${TZ})::int AS weekday,
        extract(hour FROM s."completedAt" AT TIME ZONE ${TZ})::int AS hour,
        sum(s."totalMinor")::bigint AS amount, count(*)::int AS tickets
      FROM "Sale" s WHERE ${sales} GROUP BY 1, 2 ORDER BY 1, 2`;
  }

  /** Descuentos otorgados: de línea y general (repartido en las líneas). */
  private async discounts(sales: Prisma.Sql) {
    const [row] = await this.prisma.$queryRaw<{ amount: bigint }[]>`
      SELECT coalesce(sum(si."discountMinor"), 0)::bigint AS amount
      FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id WHERE ${sales}`;
    return row?.amount ?? 0n;
  }
}
