import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { REPORT_DEFAULTS, type ReportProducts } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import { kpi, sharePct } from "./report-math";
import { argentineDate, type ReportRange } from "./report-period";
import {
  LINE,
  ReportSalesData,
  RETURNED,
  returnsWhere,
  salesWhere,
} from "./report-sales-data";
import {
  daysBetween,
  marginPct,
  profitBy,
  reportMeta,
  rejectFilters,
} from "./report-tab-helpers";

/** Productos para rotación contra margen: los que más venden, legibles. */
const ROTATION_POINTS = 120;

/**
 * Cuántos de los primeros (ya ordenados de mayor a menor) suman el 80 % del
 * total. Regla de Pareto: suele ser una parte chica del catálogo.
 */
export function paretoCount(values: readonly bigint[], threshold = 80) {
  const total = values.reduce((sum, value) => sum + value, 0n);
  if (total <= 0n) return 0;
  let acc = 0n;
  for (const [index, value] of values.entries()) {
    acc += value;
    if (acc * 100n >= total * BigInt(threshold)) return index + 1;
  }
  return values.length;
}

/**
 * Pestaña Productos (SISTEMA-116): qué se vende, qué concentra la venta, qué
 * está parado. Stock y "sin movimiento" son estado actual; ventas, del período.
 */
@Injectable()
export class ReportProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
    private readonly salesData: ReportSalesData,
  ) {}

  async products(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportProducts> {
    rejectFilters(query, ["staleDays", "lowStockThreshold"], "Productos");
    const scope = await this.access.scope(actorId, organizationId, query, now);
    const { period, branchIds, access } = scope;
    const today = argentineDate(now);
    const staleDays = query.staleDays ?? REPORT_DEFAULTS.staleDays;
    const lowStock =
      query.lowStockThreshold ?? REPORT_DEFAULTS.lowStockThreshold;
    const sales = (range: ReportRange) =>
      salesWhere(organizationId, branchIds, range);
    const returns = (range: ReportRange) =>
      returnsWhere(organizationId, branchIds, range);
    const previous = period.previous;

    const [
      sold,
      soldBefore,
      profits,
      categories,
      stock,
      lastSales,
      activeCount,
    ] = await Promise.all([
      this.productSales(sales(period), returns(period)),
      previous ? this.productSales(sales(previous), returns(previous)) : null,
      access.profitability
        ? profitBy(
            this.prisma,
            Prisma.sql`p.id::text`,
            sales(period),
            returns(period),
          )
        : null,
      this.salesData.categories(organizationId, sales(period), returns(period)),
      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          category: string | null;
          stock: number;
          value: bigint;
        }[]
      >`
        SELECT p.id, p.name, c.name AS category,
          coalesce(sum(pl.quantity), 0)::int AS stock,
          coalesce(sum(pl.quantity * pl."unitCostMinor"), 0)::bigint AS value
        FROM "Product" p
        JOIN "ProductLot" pl ON pl."productId" = p.id
          AND pl."branchId" = ANY(${branchIds}::uuid[]) AND pl.quantity > 0
          AND (pl."expiresAt" IS NULL OR pl."expiresAt" >= ${today}::date)
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."organizationId" = ${organizationId}::uuid AND p.active
        GROUP BY p.id, p.name, c.name`,
      this.prisma.$queryRaw<{ id: string; last: Date }[]>`
        SELECT si."productId" AS id, max(s."completedAt") AS last
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE s."organizationId" = ${organizationId}::uuid
          AND s."branchId" = ANY(${branchIds}::uuid[]) AND s.status = 'COMPLETED'
          AND si."productId" IS NOT NULL
        GROUP BY 1`,
      this.activeProducts(organizationId, branchIds),
    ]);

    const stockBy = new Map(stock.map((row) => [row.id, row]));
    const last = new Map(lastSales.map((row) => [row.id, row.last]));
    const names = new Map(
      (
        await this.prisma.product.findMany({
          where: { id: { in: [...sold.keys()] } },
          select: {
            id: true,
            name: true,
            category: { select: { name: true } },
          },
        })
      ).map((row) => [row.id, row]),
    );
    const rows = [...sold]
      .filter(([, row]) => row.units > 0)
      .map(([id, row]) => {
        const profit = profits?.get(id);
        const onHand = stockBy.get(id)?.stock ?? 0;
        const gain = profit ? profit.netSales - profit.cost : null;
        return {
          id,
          name: names.get(id)?.name ?? "Producto",
          category: names.get(id)?.category?.name ?? null,
          units: row.units,
          netSalesMinor: row.amount.toString(),
          profitMinor: gain === null ? null : gain.toString(),
          marginPct:
            profit && gain !== null ? marginPct(gain, profit.netSales) : null,
          stock: onHand,
          rotation:
            onHand > 0 ? Math.round((row.units / onHand) * 100) / 100 : null,
          amount: row.amount,
        };
      });
    const byAmount = [...rows].sort((left, right) =>
      right.amount > left.amount ? 1 : -1,
    );
    const pareto = paretoCount(byAmount.map((row) => row.amount));
    const paretoBefore = soldBefore
      ? paretoCount(
          [...soldBefore.values()]
            .filter((row) => row.units > 0)
            .map((row) => row.amount)
            .sort((left, right) => (right > left ? 1 : -1)),
        )
      : null;
    const strip = (row: (typeof rows)[number]) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      units: row.units,
      netSalesMinor: row.netSalesMinor,
      profitMinor: row.profitMinor,
      marginPct: row.marginPct,
      stock: row.stock,
      rotation: row.rotation,
    });

    const staleSince = Date.parse(`${today}T00:00:00Z`) - staleDays * 86400000;
    const stale = stock
      .filter((row) => {
        const date = last.get(row.id);
        return !date || date.getTime() < staleSince;
      })
      .map((row) => {
        const date = last.get(row.id) ?? null;
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          stock: row.stock,
          stockValueMinor: access.profitability ? row.value.toString() : null,
          lastSaleAt: date?.toISOString() ?? null,
          daysWithoutSales: date
            ? daysBetween(argentineDate(date), today)
            : null,
          value: row.value,
        };
      })
      .sort(
        (left, right) =>
          (right.daysWithoutSales ?? 100000) -
            (left.daysWithoutSales ?? 100000) ||
          (right.value > left.value ? 1 : -1),
      );
    const lowStockCount = stock.filter((row) => row.stock <= lowStock).length;

    return {
      meta: reportMeta("products", scope, now),
      kpis: {
        activeProducts: kpi("count", activeCount, null),
        paretoProducts: kpi("count", pareto, paretoBefore),
        staleProducts: kpi("count", stale.length, null),
        lowStock: kpi("count", lowStockCount, null),
      },
      charts: {
        top: [...rows]
          .sort(
            (left, right) =>
              right.units - left.units || (right.amount > left.amount ? 1 : -1),
          )
          .slice(0, 20)
          .map(strip),
        categories: categories.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.value.toString(),
          sharePct: sharePct(
            row.value,
            categories.reduce((sum, item) => sum + item.value, 0n),
          ),
        })),
        rotation: byAmount
          .filter((row) => row.rotation !== null)
          .slice(0, ROTATION_POINTS)
          .map(strip),
      },
      tables: {
        stale: stale.slice(0, 100).map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          stock: row.stock,
          stockValueMinor: row.stockValueMinor,
          lastSaleAt: row.lastSaleAt,
          daysWithoutSales: row.daysWithoutSales,
        })),
        staleDays,
        pareto: {
          products: pareto,
          ofProducts: rows.length,
          sharePct: sharePct(pareto, rows.length),
        },
      },
    };
  }

  /** Unidades y ventas netas por producto, menos devoluciones del período. */
  private async productSales(sales: Prisma.Sql, returns: Prisma.Sql) {
    const [sold, back] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; units: number; amount: bigint }[]>`
        SELECT si."productId" AS id, sum(si.quantity)::int AS units,
          sum(${LINE})::bigint AS amount
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE ${sales} AND si."productId" IS NOT NULL GROUP BY 1`,
      this.prisma.$queryRaw<{ id: string; units: number; amount: bigint }[]>`
        SELECT si."productId" AS id, sum(cri.quantity)::int AS units,
          sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        WHERE ${returns} AND si."productId" IS NOT NULL GROUP BY 1`,
    ]);
    const totals = new Map(
      sold.map((row) => [row.id, { units: row.units, amount: row.amount }]),
    );
    for (const row of back) {
      const found = totals.get(row.id) ?? { units: 0, amount: 0n };
      totals.set(row.id, {
        units: found.units - row.units,
        amount: found.amount - row.amount,
      });
    }
    return totals;
  }

  /** Activos y no archivados en todas las sucursales del alcance. */
  private async activeProducts(organizationId: string, branchIds: string[]) {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "Product" p
      WHERE p."organizationId" = ${organizationId}::uuid AND p.active
        AND (SELECT count(*) FROM "ProductBranchState" st
             WHERE st."productId" = p.id AND st."branchId" = ANY(${branchIds}::uuid[])
               AND st.status <> 'ACTIVE') < ${branchIds.length}::int`;
    return row?.count ?? 0;
  }
}
