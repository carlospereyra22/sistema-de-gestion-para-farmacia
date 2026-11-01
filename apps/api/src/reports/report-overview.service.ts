import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

const TZ = "America/Argentina/Buenos_Aires";

/** Linea neta de venta y su parte devuelta, redondeada a centavos. */
const LINE = Prisma.sql`(si."unitPriceMinor" * si.quantity - si."discountMinor")`;
const RETURNED = Prisma.sql`round(${LINE}::numeric * cri.quantity / si.quantity)`;

type BranchTotals = {
  tickets: number;
  /** Facturado (Sale.totalMinor) y devuelto en el periodo: neto = invoiced − returned. */
  invoiced: bigint;
  returned: bigint;
  units: number;
  costedSales: bigint;
  cost: bigint;
};

const emptyTotals = (): BranchTotals => ({
  tickets: 0,
  invoiced: 0n,
  returned: 0n,
  units: 0,
  costedSales: 0n,
  cost: 0n,
});

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
    const sales = (range: ReportRange) => Prisma.sql`
      s."organizationId" = ${organizationId}::uuid
      AND s."branchId" = ANY(${branchIds}::uuid[])
      AND s.status = 'COMPLETED'
      AND s."completedAt" >= ${range.start} AND s."completedAt" < ${range.end}`;
    const returns = (range: ReportRange) => Prisma.sql`
      cr."organizationId" = ${organizationId}::uuid
      AND cr."branchId" = ANY(${branchIds}::uuid[])
      AND cr."createdAt" >= ${range.start} AND cr."createdAt" < ${range.end}`;

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
      this.branchTotals(sales(period), returns(period)),
      period.previous
        ? this.branchTotals(sales(period.previous), returns(period.previous))
        : null,
      this.trend(sales(period), returns(period), granularity),
      period.previous
        ? this.trend(
            sales(period.previous),
            returns(period.previous),
            granularity,
          )
        : null,
      this.categories(organizationId, sales(period), returns(period)),
      this.prisma.$queryRaw<{ method: string; amount: bigint }[]>`
        WITH s AS (
          SELECT s.id, s."totalMinor" FROM "Sale" s WHERE ${sales(period)}
        ), p AS (
          SELECT sp."saleId", sp.method::text AS method, sum(sp."amountMinor") AS amount
          FROM "SalePayment" sp JOIN s ON s.id = sp."saleId" GROUP BY 1, 2
        ), t AS (SELECT "saleId", sum(amount) AS paid FROM p GROUP BY 1)
        SELECT p.method, sum(
          p.amount - CASE WHEN p.method = 'CASH'
            THEN greatest(t.paid - s."totalMinor", 0) ELSE 0 END
        )::bigint AS amount
        FROM p JOIN t ON t."saleId" = p."saleId" JOIN s ON s.id = p."saleId"
        GROUP BY p.method ORDER BY amount DESC`,
      this.products(sales(period), returns(period)),
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

    const sum = (rows: Map<string, BranchTotals>) =>
      [...rows.values()].reduce(
        (total, row) => ({
          tickets: total.tickets + row.tickets,
          invoiced: total.invoiced + row.invoiced,
          returned: total.returned + row.returned,
          units: total.units + row.units,
          costedSales: total.costedSales + row.costedSales,
          cost: total.cost + row.cost,
        }),
        emptyTotals(),
      );
    const total = sum(current);
    const before = previous ? sum(previous) : null;
    const profit = (row: BranchTotals) => row.costedSales - row.cost;
    const net = (row: BranchTotals) => row.invoiced - row.returned;

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
          value: (trend.get(bucket) ?? 0n).toString(),
          previous: previousTrend
            ? (previousTrend.get(previousBuckets[index] ?? "") ?? 0n).toString()
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
   * Totales por sucursal. `units`, `costedSales` y `cost` ya vienen netos de las
   * devoluciones del periodo (se restan en la fecha de la devolucion); el importe
   * devuelto queda aparte en `returned` para que el ticket promedio use lo facturado.
   */
  private async branchTotals(sales: Prisma.Sql, returns: Prisma.Sql) {
    const [tickets, lines, returned] = await Promise.all([
      this.prisma.$queryRaw<
        { branchId: string; tickets: number; invoiced: bigint }[]
      >`
        SELECT s."branchId" AS "branchId", count(*)::int AS tickets,
          coalesce(sum(s."totalMinor"), 0)::bigint AS invoiced
        FROM "Sale" s WHERE ${sales} GROUP BY s."branchId"`,
      this.prisma.$queryRaw<
        { branchId: string; units: number; costedSales: bigint; cost: bigint }[]
      >`
        SELECT s."branchId" AS "branchId",
          coalesce(sum(CASE WHEN si."productId" IS NOT NULL THEN si.quantity END), 0)::int AS units,
          coalesce(sum(CASE WHEN pl.id IS NOT NULL THEN ${LINE} END), 0)::bigint AS "costedSales",
          coalesce(sum(pl."unitCostMinor" * si.quantity), 0)::bigint AS cost
        FROM "Sale" s
        JOIN "SaleItem" si ON si."saleId" = s.id
        LEFT JOIN "ProductLot" pl ON pl.id = si."lotId"
        WHERE ${sales} GROUP BY s."branchId"`,
      this.prisma.$queryRaw<
        {
          branchId: string;
          amount: bigint;
          units: number;
          costedAmount: bigint;
          cost: bigint;
        }[]
      >`
        SELECT cr."branchId" AS "branchId",
          coalesce(sum(${RETURNED}), 0)::bigint AS amount,
          coalesce(sum(CASE WHEN si."productId" IS NOT NULL THEN cri.quantity END), 0)::int AS units,
          coalesce(sum(CASE WHEN pl.id IS NOT NULL THEN ${RETURNED} END), 0)::bigint AS "costedAmount",
          coalesce(sum(pl."unitCostMinor" * cri.quantity), 0)::bigint AS cost
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        LEFT JOIN "ProductLot" pl ON pl.id = si."lotId"
        WHERE ${returns} GROUP BY cr."branchId"`,
    ]);
    const rows = new Map<string, BranchTotals>();
    const row = (branchId: string) => {
      const found = rows.get(branchId) ?? emptyTotals();
      rows.set(branchId, found);
      return found;
    };
    for (const item of tickets) {
      row(item.branchId).tickets = item.tickets;
      row(item.branchId).invoiced += item.invoiced;
    }
    for (const item of lines) {
      const target = row(item.branchId);
      target.units += item.units;
      target.costedSales += item.costedSales;
      target.cost += item.cost;
    }
    for (const item of returned) {
      const target = row(item.branchId);
      target.returned += item.amount;
      target.units -= item.units;
      target.costedSales -= item.costedAmount;
      target.cost -= item.cost;
    }
    return rows;
  }

  /** Ventas netas por dia o mes local: facturado − devoluciones del tramo. */
  private async trend(
    sales: Prisma.Sql,
    returns: Prisma.Sql,
    unit: "day" | "month",
  ) {
    const [invoiced, returned] = await Promise.all([
      this.prisma.$queryRaw<{ bucket: string; amount: bigint }[]>`
        SELECT to_char(date_trunc(${unit}, s."completedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(s."totalMinor")::bigint AS amount
        FROM "Sale" s WHERE ${sales} GROUP BY 1`,
      this.prisma.$queryRaw<{ bucket: string; amount: bigint }[]>`
        SELECT to_char(date_trunc(${unit}, cr."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        WHERE ${returns} GROUP BY 1`,
    ]);
    const buckets = new Map<string, bigint>();
    for (const row of invoiced)
      buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0n) + row.amount);
    for (const row of returned)
      buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0n) - row.amount);
    return buckets;
  }

  /** Ventas netas por la categoria asignada al producto. */
  private async categories(
    organizationId: string,
    sales: Prisma.Sql,
    returns: Prisma.Sql,
  ) {
    const key = Prisma.sql`CASE WHEN si."productId" IS NULL THEN 'manual'
      ELSE coalesce(p."categoryId"::text, 'none') END`;
    const [sold, returned, names] = await Promise.all([
      this.prisma.$queryRaw<{ key: string; amount: bigint }[]>`
        SELECT ${key} AS key, sum(${LINE})::bigint AS amount
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        LEFT JOIN "Product" p ON p.id = si."productId"
        WHERE ${sales} GROUP BY 1`,
      this.prisma.$queryRaw<{ key: string; amount: bigint }[]>`
        SELECT ${key} AS key, sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        LEFT JOIN "Product" p ON p.id = si."productId"
        WHERE ${returns} GROUP BY 1`,
      this.prisma.category.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);
    const label = new Map(names.map((item) => [item.id, item.name]));
    const totals = new Map<string, bigint>();
    for (const row of sold) totals.set(row.key, row.amount);
    for (const row of returned)
      totals.set(row.key, (totals.get(row.key) ?? 0n) - row.amount);
    return [...totals]
      .map(([id, value]) => ({
        id: id === "manual" || id === "none" ? null : id,
        name:
          id === "manual"
            ? "Conceptos manuales"
            : id === "none"
              ? "Sin categoría"
              : (label.get(id) ?? "Categoría"),
        value,
      }))
      .filter((row) => row.value !== 0n)
      .sort((left, right) => (right.value > left.value ? 1 : -1));
  }

  /** Top 10 productos por unidades netas de devoluciones. */
  private async products(sales: Prisma.Sql, returns: Prisma.Sql) {
    const [sold, returned] = await Promise.all([
      this.prisma.$queryRaw<
        { id: string; name: string; units: number; amount: bigint }[]
      >`
        SELECT p.id, p.name, sum(si.quantity)::int AS units, sum(${LINE})::bigint AS amount
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        JOIN "Product" p ON p.id = si."productId"
        WHERE ${sales} GROUP BY p.id, p.name`,
      this.prisma.$queryRaw<{ id: string; units: number; amount: bigint }[]>`
        SELECT si."productId" AS id, sum(cri.quantity)::int AS units,
          sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        WHERE ${returns} AND si."productId" IS NOT NULL GROUP BY 1`,
    ]);
    const back = new Map(returned.map((row) => [row.id, row]));
    return sold
      .map((row) => ({
        ...row,
        units: row.units - (back.get(row.id)?.units ?? 0),
        amount: row.amount - (back.get(row.id)?.amount ?? 0n),
      }))
      .filter((row) => row.units > 0)
      .sort(
        (left, right) =>
          right.units - left.units || (right.amount > left.amount ? 1 : -1),
      )
      .slice(0, 10);
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
