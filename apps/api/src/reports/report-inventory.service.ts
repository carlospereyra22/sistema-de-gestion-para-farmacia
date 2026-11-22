import { Injectable } from "@nestjs/common";
import { REPORT_DEFAULTS, type ReportInventory } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import { kpi, sharePct, trendBuckets } from "./report-math";
import { argentineDate } from "./report-period";
import {
  civil,
  daysBetween,
  reportMeta,
  rejectFilters,
  trendUnitOf,
} from "./report-tab-helpers";

/** Ventana para "sin stock": productos que se vendían y se quedaron sin stock. */
const OUT_OF_STOCK_SALES_DAYS = 90;
/** Ventana de la venta diaria para calcular los días de cobertura. */
const COVERAGE_SALES_DAYS = 30;
const DAY = 86400000;

/** Días que alcanza el stock con la venta diaria; null si no se vende. */
export function coverageDays(stock: number, dailyUnits: number | null) {
  if (!dailyUnits || dailyUnits <= 0) return null;
  return Math.floor(stock / dailyUnits);
}

/**
 * Fin de cada tramo (instante): el comienzo del siguiente en hora de Argentina,
 * y el último, el fin del período o ahora si es antes.
 */
export function bucketEnds(
  buckets: readonly string[],
  periodEnd: Date,
  now: Date,
) {
  const last = Math.min(periodEnd.getTime(), now.getTime());
  return buckets.map((_, index) =>
    index + 1 < buckets.length
      ? new Date(
          Math.min(Date.parse(`${buckets[index + 1]}T00:00:00-03:00`), last),
        )
      : new Date(last),
  );
}

/**
 * Pestaña Inventario (SISTEMA-116). El estado es el actual (stock, vencimientos,
 * faltantes); la evolución reconstruye el stock al cierre de cada tramo con
 * InventoryMovement (stock actual menos lo que se movió después), sin inventar.
 * El valor es a costo de lote, nunca a precio de venta, y sólo con permiso de
 * costos.
 */
@Injectable()
export class ReportInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
  ) {}

  async inventory(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportInventory> {
    rejectFilters(
      query,
      ["granularity", "lowStockThreshold", "expiryWindowDays"],
      "Inventario",
    );
    const scope = await this.access.scope(actorId, organizationId, query, now);
    const { period, branchIds, access } = scope;
    const showsValue = access.profitability;
    const unit = trendUnitOf(query, period);
    const today = argentineDate(now);
    const lowStock =
      query.lowStockThreshold ?? REPORT_DEFAULTS.lowStockThreshold;
    const expiryDays =
      query.expiryWindowDays ?? REPORT_DEFAULTS.expiryWindowDays;
    const buckets = trendBuckets(period, unit);
    const ends = bucketEnds(buckets, period.end, now);
    const salesSince = (days: number) => new Date(now.getTime() - days * DAY);

    const [lots, products, recent, history, categoryNames] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          productId: string;
          product: string;
          number: string;
          branch: string;
          expiresAt: Date | null;
          quantity: number;
          cost: bigint;
        }[]
      >`
        SELECT pl.id, pl."productId" AS "productId", p.name AS product, pl.number,
          b.name AS branch, pl."expiresAt" AS "expiresAt", pl.quantity,
          pl."unitCostMinor" AS cost
        FROM "ProductLot" pl
        JOIN "Product" p ON p.id = pl."productId"
        JOIN "Branch" b ON b.id = pl."branchId"
        WHERE pl."organizationId" = ${organizationId}::uuid
          AND pl."branchId" = ANY(${branchIds}::uuid[]) AND pl.quantity > 0`,
      this.prisma.product.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true, categoryId: true },
      }),
      this.prisma.$queryRaw<{ id: string; units: number; last: Date }[]>`
        SELECT si."productId" AS id, sum(si.quantity)
          FILTER (WHERE s."completedAt" >= ${salesSince(COVERAGE_SALES_DAYS)})::int AS units,
          max(s."completedAt") AS last
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE s."organizationId" = ${organizationId}::uuid
          AND s."branchId" = ANY(${branchIds}::uuid[]) AND s.status = 'COMPLETED'
          AND s."completedAt" >= ${salesSince(OUT_OF_STOCK_SALES_DAYS)}
          AND si."productId" IS NOT NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<{ index: number; units: bigint; value: bigint }[]>`
        WITH ends AS (
          SELECT * FROM unnest(${ends}::timestamptz[]) WITH ORDINALITY AS e(at, index)
        ), moves AS (
          SELECT m."occurredAt" AS at, m.quantity,
            m.quantity * pl."unitCostMinor" AS value
          FROM "InventoryMovement" m JOIN "ProductLot" pl ON pl.id = m."lotId"
          WHERE m."organizationId" = ${organizationId}::uuid
            AND m."branchId" = ANY(${branchIds}::uuid[])
            AND m."occurredAt" >= ${ends[0] ?? now}
        ), now_stock AS (
          SELECT coalesce(sum(quantity), 0)::bigint AS units,
            coalesce(sum(quantity * "unitCostMinor"), 0)::bigint AS value
          FROM "ProductLot"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "branchId" = ANY(${branchIds}::uuid[])
        )
        SELECT e.index::int AS index,
          (n.units - coalesce((SELECT sum(quantity) FROM moves WHERE moves.at >= e.at), 0))::bigint AS units,
          (n.value - coalesce((SELECT sum(value) FROM moves WHERE moves.at >= e.at), 0))::bigint AS value
        FROM ends e CROSS JOIN now_stock n ORDER BY e.index`,
      this.prisma.category.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);

    const productBy = new Map(products.map((row) => [row.id, row]));
    const categoryName = new Map(
      categoryNames.map((row) => [row.id, row.name]),
    );
    const expired = (lot: (typeof lots)[number]) =>
      lot.expiresAt !== null && civil(lot.expiresAt) < today;
    // Stock vendible (sin vencidos) por producto.
    const sellable = new Map<string, number>();
    for (const lot of lots)
      if (!expired(lot))
        sellable.set(
          lot.productId,
          (sellable.get(lot.productId) ?? 0) + lot.quantity,
        );
    const recentBy = new Map(recent.map((row) => [row.id, row]));

    const totalValue = lots.reduce(
      (sum, lot) => sum + BigInt(lot.quantity) * lot.cost,
      0n,
    );
    const totalUnits = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const expiredUnits = lots
      .filter(expired)
      .reduce((sum, lot) => sum + lot.quantity, 0);
    const lowStockCount = [...sellable].filter(
      ([id, units]) => productBy.has(id) && units > 0 && units <= lowStock,
    ).length;
    const outOfStock = recent.filter(
      (row) => productBy.has(row.id) && !(sellable.get(row.id) ?? 0),
    ).length;
    const expiring = lots
      .filter((lot) => lot.expiresAt !== null)
      .map((lot) => ({
        lot,
        daysLeft: daysBetween(today, civil(lot.expiresAt!)),
      }))
      .filter(({ daysLeft }) => daysLeft <= expiryDays)
      .sort((left, right) => left.daysLeft - right.daysLeft);

    const byCategory = new Map<string, { value: bigint; units: number }>();
    for (const lot of lots) {
      if (expired(lot)) continue;
      const key = productBy.get(lot.productId)?.categoryId ?? "none";
      const found = byCategory.get(key) ?? { value: 0n, units: 0 };
      byCategory.set(key, {
        value: found.value + BigInt(lot.quantity) * lot.cost,
        units: found.units + lot.quantity,
      });
    }
    const categoryRows = [...byCategory]
      .map(([id, row]) => ({
        id: id === "none" ? null : id,
        name:
          id === "none"
            ? "Sin categoría"
            : (categoryName.get(id) ?? "Categoría"),
        amount: showsValue ? row.value : BigInt(row.units),
        units: row.units,
      }))
      .sort((left, right) => (right.amount > left.amount ? 1 : -1));
    const categoryTotal = categoryRows.reduce(
      (sum, row) => sum + row.amount,
      0n,
    );

    const critical = [...sellable]
      .filter(([id, units]) => productBy.has(id) && units > 0)
      .map(([id, units]) => {
        const sold = recentBy.get(id)?.units ?? 0;
        const daily = sold > 0 ? sold / COVERAGE_SALES_DAYS : null;
        return {
          id,
          name: productBy.get(id)!.name,
          stock: units,
          soldLast30: sold,
          dailyUnits: daily === null ? null : Math.round(daily * 10) / 10,
          coverageDays: coverageDays(units, daily),
        };
      })
      .filter(
        (row) =>
          row.stock <= lowStock ||
          (row.coverageDays !== null && row.coverageDays <= 15),
      )
      .sort(
        (left, right) =>
          (left.coverageDays ?? 100000) - (right.coverageDays ?? 100000) ||
          left.stock - right.stock,
      )
      .slice(0, 15);

    // Salud del stock por producto (cada producto en un solo estado, el peor).
    const expiredProducts = new Set(
      lots.filter(expired).map((lot) => lot.productId),
    );
    const expiringProducts = new Set(
      expiring
        .filter(({ daysLeft }) => daysLeft >= 0)
        .map(({ lot }) => lot.productId),
    );
    const health = {
      healthy: 0,
      low: 0,
      out: outOfStock,
      expiring: 0,
      expired: 0,
    };
    for (const [id, units] of sellable) {
      if (!productBy.has(id) || units <= 0) continue;
      if (expiredProducts.has(id)) health.expired += 1;
      else if (expiringProducts.has(id)) health.expiring += 1;
      else if (units <= lowStock) health.low += 1;
      else health.healthy += 1;
    }
    for (const id of expiredProducts)
      if (productBy.has(id) && !(sellable.get(id) ?? 0)) health.expired += 1;
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + index);
      return date.toISOString().slice(0, 7);
    });
    const expiryByMonth = [
      { key: "expired", match: (lot: (typeof lots)[number]) => expired(lot) },
      ...months.map((month) => ({
        key: month,
        match: (lot: (typeof lots)[number]) =>
          !expired(lot) &&
          lot.expiresAt !== null &&
          civil(lot.expiresAt).slice(0, 7) === month,
      })),
    ].map(({ key, match }) => {
      const group = lots.filter(match);
      return {
        month: key,
        lots: group.length,
        units: group.reduce((sum, lot) => sum + lot.quantity, 0),
        valueMinor: showsValue
          ? group
              .reduce((sum, lot) => sum + BigInt(lot.quantity) * lot.cost, 0n)
              .toString()
          : null,
      };
    });

    return {
      meta: reportMeta(
        "inventory",
        scope,
        now,
        showsValue
          ? []
          : [
              "Sin permiso para ver costos: se muestran unidades en vez de valores.",
            ],
      ),
      kpis: {
        stockValue: showsValue
          ? kpi("money", totalValue, null, { estimated: true })
          : kpi("units", totalUnits - expiredUnits, null),
        lowStock: kpi("count", lowStockCount, null),
        outOfStock: kpi("count", outOfStock, null),
        expiringLots: kpi(
          "count",
          expiring.filter(({ daysLeft }) => daysLeft >= 0).length,
          null,
        ),
      },
      charts: {
        trendUnit: unit,
        trend: buckets.map((bucket, index) => {
          const row = history[index];
          return {
            bucket,
            units: Number(row?.units ?? 0),
            valueMinor: showsValue ? (row?.value ?? 0n).toString() : null,
          };
        }),
        categories: categoryRows.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.amount.toString(),
          sharePct: sharePct(row.amount, categoryTotal),
          units: row.units,
        })),
        health,
        stockDays: (() => {
          const byCategory = new Map<string, { units: number; sold: number }>();
          for (const [id, units] of sellable) {
            const key = productBy.get(id)?.categoryId ?? "none";
            if (!productBy.has(id)) continue;
            const found = byCategory.get(key) ?? { units: 0, sold: 0 };
            found.units += units;
            byCategory.set(key, found);
          }
          for (const row of recent) {
            if (!productBy.has(row.id)) continue;
            const key = productBy.get(row.id)?.categoryId ?? "none";
            const found = byCategory.get(key) ?? { units: 0, sold: 0 };
            found.sold += row.units ?? 0;
            byCategory.set(key, found);
          }
          return [...byCategory]
            .filter(([, row]) => row.units > 0)
            .map(([id, row]) => ({
              id: id === "none" ? null : id,
              name:
                id === "none"
                  ? "Sin categoría"
                  : (categoryName.get(id) ?? "Categoría"),
              units: row.units,
              days:
                row.sold > 0
                  ? Math.round(row.units / (row.sold / COVERAGE_SALES_DAYS))
                  : null,
            }))
            .sort((a, b) => (b.days ?? 100000) - (a.days ?? 100000))
            .slice(0, 12);
        })(),
        expiryByMonth,
      },
      tables: {
        expiring: expiring.slice(0, 100).map(({ lot, daysLeft }) => ({
          lotId: lot.id,
          product: lot.product,
          lot: lot.number,
          branch: lot.branch,
          expiresAt: civil(lot.expiresAt!),
          quantity: lot.quantity,
          daysLeft,
          valueMinor: showsValue
            ? (BigInt(lot.quantity) * lot.cost).toString()
            : null,
        })),
        critical,
        lowStockThreshold: lowStock,
        expiryWindowDays: expiryDays,
        units: { sellable: totalUnits - expiredUnits, expired: expiredUnits },
        showsValue,
      },
    };
  }
}
