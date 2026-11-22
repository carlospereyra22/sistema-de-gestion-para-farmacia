import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ReportRange } from "./report-period";

export const TZ = "America/Argentina/Buenos_Aires";

/** Linea neta de venta y su parte devuelta, redondeada a centavos. */
export const LINE = Prisma.sql`(si."unitPriceMinor" * si.quantity - si."discountMinor")`;
export const RETURNED = Prisma.sql`round(${LINE}::numeric * cri.quantity / si.quantity)`;

export type BranchTotals = {
  tickets: number;
  /** Facturado (Sale.totalMinor) y devuelto en el periodo: neto = invoiced − returned. */
  invoiced: bigint;
  returned: bigint;
  units: number;
  costedSales: bigint;
  cost: bigint;
};

export const emptyTotals = (): BranchTotals => ({
  tickets: 0,
  invoiced: 0n,
  returned: 0n,
  units: 0,
  costedSales: 0n,
  cost: 0n,
});

export const netOf = (row: BranchTotals) => row.invoiced - row.returned;
export const profitOf = (row: BranchTotals) => row.costedSales - row.cost;

export function sumTotals(rows: Iterable<BranchTotals>): BranchTotals {
  const total = emptyTotals();
  for (const row of rows) {
    total.tickets += row.tickets;
    total.invoiced += row.invoiced;
    total.returned += row.returned;
    total.units += row.units;
    total.costedSales += row.costedSales;
    total.cost += row.cost;
  }
  return total;
}

/** Ventas confirmadas de las sucursales del alcance dentro del rango. */
export const salesWhere = (
  organizationId: string,
  branchIds: string[],
  range: ReportRange,
) => Prisma.sql`
  s."organizationId" = ${organizationId}::uuid
  AND s."branchId" = ANY(${branchIds}::uuid[])
  AND s.status = 'COMPLETED'
  AND s."completedAt" >= ${range.start} AND s."completedAt" < ${range.end}`;

/** Devoluciones del rango: se restan en la fecha en que ocurren. */
export const returnsWhere = (
  organizationId: string,
  branchIds: string[],
  range: ReportRange,
) => Prisma.sql`
  cr."organizationId" = ${organizationId}::uuid
  AND cr."branchId" = ANY(${branchIds}::uuid[])
  AND cr."createdAt" >= ${range.start} AND cr."createdAt" < ${range.end}`;

export type TrendUnit = "day" | "week" | "month";

/**
 * Consultas de ventas que comparten Resumen y Ventas (SISTEMA-115): las dos
 * pestañas usan las mismas fórmulas, así sus cifras siempre coinciden.
 * Fórmulas: docs/REPORTS_PLAN.md, "Mapa de metricas".
 */
@Injectable()
export class ReportSalesData {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Totales por sucursal. `units`, `costedSales` y `cost` ya vienen netos de las
   * devoluciones del periodo (se restan en la fecha de la devolucion); el importe
   * devuelto queda aparte en `returned` para que el ticket promedio use lo facturado.
   */
  async branchTotals(sales: Prisma.Sql, returns: Prisma.Sql) {
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

  /**
   * Ventas netas (facturado − devoluciones del tramo) y tickets por dia, semana
   * (desde el lunes) o mes local.
   */
  async trend(sales: Prisma.Sql, returns: Prisma.Sql, unit: TrendUnit) {
    const [invoiced, returned] = await Promise.all([
      this.prisma.$queryRaw<
        { bucket: string; amount: bigint; tickets: number }[]
      >`
        SELECT to_char(date_trunc(${unit}, s."completedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(s."totalMinor")::bigint AS amount, count(*)::int AS tickets
        FROM "Sale" s WHERE ${sales} GROUP BY 1`,
      this.prisma.$queryRaw<{ bucket: string; amount: bigint }[]>`
        SELECT to_char(date_trunc(${unit}, cr."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
          sum(${RETURNED})::bigint AS amount
        FROM "CustomerReturn" cr
        JOIN "CustomerReturnItem" cri ON cri."customerReturnId" = cr.id
        JOIN "SaleItem" si ON si.id = cri."saleItemId"
        WHERE ${returns} GROUP BY 1`,
    ]);
    const buckets = new Map<string, { amount: bigint; tickets: number }>();
    for (const row of invoiced)
      buckets.set(row.bucket, { amount: row.amount, tickets: row.tickets });
    for (const row of returned) {
      const found = buckets.get(row.bucket) ?? { amount: 0n, tickets: 0 };
      buckets.set(row.bucket, { ...found, amount: found.amount - row.amount });
    }
    return buckets;
  }

  /** Ventas netas y unidades netas por la categoria asignada al producto. */
  async categories(
    organizationId: string,
    sales: Prisma.Sql,
    returns: Prisma.Sql,
  ) {
    const key = Prisma.sql`CASE WHEN si."productId" IS NULL THEN 'manual'
      ELSE coalesce(p."categoryId"::text, 'none') END`;
    const [sold, returned, names] = await Promise.all([
      this.prisma.$queryRaw<{ key: string; amount: bigint; units: number }[]>`
        SELECT ${key} AS key, sum(${LINE})::bigint AS amount,
          coalesce(sum(CASE WHEN si."productId" IS NOT NULL THEN si.quantity END), 0)::int AS units
        FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
        LEFT JOIN "Product" p ON p.id = si."productId"
        WHERE ${sales} GROUP BY 1`,
      this.prisma.$queryRaw<{ key: string; amount: bigint; units: number }[]>`
        SELECT ${key} AS key, sum(${RETURNED})::bigint AS amount,
          coalesce(sum(CASE WHEN si."productId" IS NOT NULL THEN cri.quantity END), 0)::int AS units
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
    const totals = new Map<string, { amount: bigint; units: number }>();
    for (const row of sold)
      totals.set(row.key, { amount: row.amount, units: row.units });
    for (const row of returned) {
      const found = totals.get(row.key) ?? { amount: 0n, units: 0 };
      totals.set(row.key, {
        amount: found.amount - row.amount,
        units: found.units - row.units,
      });
    }
    return [...totals]
      .map(([id, total]) => ({
        id: id === "manual" || id === "none" ? null : id,
        name:
          id === "manual"
            ? "Conceptos manuales"
            : id === "none"
              ? "Sin categoría"
              : (label.get(id) ?? "Categoría"),
        value: total.amount,
        units: total.units,
      }))
      .filter((row) => row.value !== 0n)
      .sort((left, right) => (right.value > left.value ? 1 : -1));
  }

  /**
   * Facturado por medio de pago: lo que se asignó a cada medio en cada venta,
   * con el vuelto restado del efectivo. La suma da lo facturado.
   */
  payments(sales: Prisma.Sql) {
    return this.prisma.$queryRaw<{ method: string; amount: bigint }[]>`
      WITH s AS (
        SELECT s.id, s."totalMinor" FROM "Sale" s WHERE ${sales}
      ), p AS (
        SELECT sp."saleId", sp.method::text AS method, sum(sp."amountMinor") AS amount
        FROM "SalePayment" sp JOIN s ON s.id = sp."saleId" GROUP BY 1, 2
      ), t AS (SELECT "saleId", sum(amount) AS paid FROM p GROUP BY 1)
      SELECT p.method, sum(
        p.amount - CASE WHEN p.method = 'CASH'
          THEN greatest(t.paid - s."totalMinor", 0) ELSE 0 END
      )::bigint AS amount
      FROM p JOIN t ON t."saleId" = p."saleId" JOIN s ON s.id = p."saleId"
      GROUP BY p.method ORDER BY amount DESC`;
  }
}
