import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ReportMeta,
  ReportProfitRow,
  ReportTab,
  ReportTrendUnit,
} from "@gestion/contracts";
import type { PrismaService } from "../prisma/prisma.service";
import type { ReportAccess, ReportScope } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import { trendGranularity } from "./report-math";
import { LINE, RETURNED, TZ } from "./report-sales-data";

/**
 * Ayudas comunes de las pestañas de Reportes (SISTEMA-116): todas responden con
 * la misma forma, rechazan los filtros que no usan y exigen su permiso en la API
 * (la web sólo oculta lo que el usuario no puede ver).
 */

export function rejectFilters(
  query: ReportFiltersQuery,
  allowed: readonly (keyof ReportFiltersQuery)[],
  tab: string,
) {
  const base = ["from", "to", "branchId", "comparison"];
  const extra = (Object.keys(query) as (keyof ReportFiltersQuery)[]).find(
    (key) =>
      query[key] !== undefined && !base.includes(key) && !allowed.includes(key),
  );
  if (extra)
    throw new BadRequestException(`${tab} no admite el filtro ${extra}.`);
}

const denied: Record<keyof Omit<ReportAccess, "export">, string> = {
  profitability: "No tenés permiso para ver costos y ganancias.",
  purchases: "No tenés permiso para ver compras.",
  customers: "No tenés permiso para ver cuentas corrientes.",
};

export function requireAccess(
  access: ReportAccess,
  key: keyof Omit<ReportAccess, "export">,
) {
  if (!access[key]) throw new ForbiddenException(denied[key]);
}

/** Agrupación pedida o automática (día hasta 3 meses, mes más largo). */
export function trendUnitOf(
  query: ReportFiltersQuery,
  period: ReportScope["period"],
): ReportTrendUnit {
  if (query.granularity === "hour")
    throw new BadRequestException(
      "La evolución se agrupa por día, semana o mes.",
    );
  return query.granularity ?? trendGranularity(period);
}

export function reportMeta(
  report: ReportTab,
  scope: ReportScope,
  now: Date,
  warnings: string[] = [],
): ReportMeta {
  const { period, branchIds } = scope;
  return {
    report,
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
  };
}

/** Margen ponderado (ganancia / ventas con costo × 100) con un decimal. */
export function marginPct(profit: bigint, netSales: bigint): number | null {
  if (netSales === 0n) return null;
  return Number((profit * 1000n) / netSales) / 10;
}

export type ProfitTotals = {
  netSales: bigint;
  cost: bigint;
  units: number;
};

/**
 * Ventas con costo de lote, costo y unidades por la clave pedida, netas de las
 * devoluciones del período. Sólo líneas con lote: lo demás no tiene costo.
 */
export async function profitBy(
  prisma: PrismaService,
  key: Prisma.Sql,
  sales: Prisma.Sql,
  returns: Prisma.Sql,
  joins: Prisma.Sql = Prisma.empty,
  /** Clave para las devoluciones si difiere (p. ej. su propia fecha). */
  returnKey: Prisma.Sql = key,
): Promise<Map<string, ProfitTotals>> {
  const [sold, back] = await Promise.all([
    prisma.$queryRaw<
      { key: string; netSales: bigint; cost: bigint; units: number }[]
    >`
      SELECT ${key} AS key, sum(${LINE})::bigint AS "netSales",
        sum(pl."unitCostMinor" * si.quantity)::bigint AS cost,
        sum(si.quantity)::int AS units
      FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
      JOIN "ProductLot" pl ON pl.id = si."lotId"
      LEFT JOIN "Product" p ON p.id = si."productId"
      ${joins}
      WHERE ${sales} GROUP BY 1`,
    prisma.$queryRaw<
      { key: string; netSales: bigint; cost: bigint; units: number }[]
    >`
      SELECT ${returnKey} AS key, sum(${RETURNED})::bigint AS "netSales",
        sum(pl."unitCostMinor" * cri.quantity)::bigint AS cost,
        sum(cri.quantity)::int AS units
      FROM "CustomerReturn" cr
      JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
      JOIN "SaleItem" si ON si.id = cri."saleItemId"
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "ProductLot" pl ON pl.id = si."lotId"
      LEFT JOIN "Product" p ON p.id = si."productId"
      ${joins}
      WHERE ${returns} GROUP BY 1`,
  ]);
  const totals = new Map<string, ProfitTotals>();
  for (const row of sold)
    totals.set(row.key, {
      netSales: row.netSales,
      cost: row.cost,
      units: row.units,
    });
  for (const row of back) {
    const found = totals.get(row.key) ?? { netSales: 0n, cost: 0n, units: 0 };
    totals.set(row.key, {
      netSales: found.netSales - row.netSales,
      cost: found.cost - row.cost,
      units: found.units - row.units,
    });
  }
  return totals;
}

export function profitRow(
  id: string | null,
  name: string,
  totals: ProfitTotals,
): ReportProfitRow {
  const profit = totals.netSales - totals.cost;
  return {
    id,
    name,
    netSalesMinor: totals.netSales.toString(),
    costMinor: totals.cost.toString(),
    profitMinor: profit.toString(),
    marginPct: marginPct(profit, totals.netSales),
    units: totals.units,
  };
}

/** Días civiles entre dos fechas YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Fecha civil YYYY-MM-DD de un Date guardado como fecha (@db.Date). */
export const civil = (date: Date) => date.toISOString().slice(0, 10);
