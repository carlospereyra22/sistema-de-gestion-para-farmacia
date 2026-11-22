import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ReportPurchases } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import { kpi, sharePct, trendBuckets, unavailableKpi } from "./report-math";
import { argentineDate, type ReportRange } from "./report-period";
import { TZ } from "./report-sales-data";
import {
  civil,
  daysBetween,
  reportMeta,
  rejectFilters,
  requireAccess,
  trendUnitOf,
} from "./report-tab-helpers";

/**
 * Variación de costo ponderada por lo comprado:
 * Σ (actual − anterior) × cantidad / Σ anterior × cantidad × 100.
 */
export function weightedCostChange(
  rows: readonly { previous: bigint; current: bigint; quantity: number }[],
): number | null {
  let base = 0n;
  let delta = 0n;
  for (const row of rows) {
    if (row.previous <= 0n || row.quantity <= 0) continue;
    base += row.previous * BigInt(row.quantity);
    delta += (row.current - row.previous) * BigInt(row.quantity);
  }
  return base === 0n ? null : Number((delta * 1000n) / base) / 10;
}

/**
 * Pestaña Compras y proveedores (SISTEMA-116). Lo recibido (mercadería que
 * entró) y lo facturado por proveedores se muestran por separado y nunca se
 * suman. Deuda por cuota: importe menos pagos no anulados.
 */
@Injectable()
export class ReportPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
  ) {}

  async purchases(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportPurchases> {
    rejectFilters(query, ["granularity"], "Compras");
    const scope = await this.access.scope(actorId, organizationId, query, now);
    requireAccess(scope.access, "purchases");
    const { period, branchIds } = scope;
    const unit = trendUnitOf(query, period);
    const today = argentineDate(now);
    const previous = period.previous;
    const receipts = (range: ReportRange) => Prisma.sql`
      r."organizationId" = ${organizationId}::uuid
      AND r."branchId" = ANY(${branchIds}::uuid[])
      AND r."createdAt" >= ${range.start} AND r."createdAt" < ${range.end}`;

    const [
      trend,
      previousTrend,
      suppliers,
      previousTotal,
      active,
      previousActive,
      invoiced,
      dues,
      costs,
      pending,
    ] = await Promise.all([
      this.received(receipts(period), unit),
      previous ? this.received(receipts(previous), unit) : null,
      this.prisma.$queryRaw<{ id: string; name: string; amount: bigint }[]>`
        SELECT sp.id, sp.name,
          sum(ri.quantity * ri."unitCostMinor")::bigint AS amount
        FROM "PurchaseReceipt" r
        JOIN "PurchaseReceiptItem" ri ON ri."receiptId" = r.id
        JOIN "Purchase" pu ON pu.id = r."purchaseId"
        JOIN "Supplier" sp ON sp.id = pu."supplierId"
        WHERE ${receipts(period)} GROUP BY sp.id, sp.name ORDER BY amount DESC`,
      previous
        ? this.prisma.$queryRaw<{ amount: bigint }[]>`
            SELECT coalesce(sum(ri.quantity * ri."unitCostMinor"), 0)::bigint AS amount
            FROM "PurchaseReceipt" r JOIN "PurchaseReceiptItem" ri ON ri."receiptId" = r.id
            WHERE ${receipts(previous)}`
        : null,
      this.activeSuppliers(organizationId, branchIds, period),
      previous
        ? this.activeSuppliers(organizationId, branchIds, previous)
        : null,
      this.prisma.$queryRaw<{ amount: bigint }[]>`
        SELECT coalesce(sum("amountMinor"), 0)::bigint AS amount
        FROM "SupplierPayableInvoice"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "branchId" = ANY(${branchIds}::uuid[])
          AND "issuedOn" >= ${period.from}::date AND "issuedOn" <= ${period.to}::date`,
      this.prisma.$queryRaw<
        {
          invoiceId: string;
          supplier: string;
          documentType: string;
          pointOfSale: string;
          documentNumber: string;
          issuedOn: Date;
          dueOn: Date | null;
          balance: bigint;
        }[]
      >`
        SELECT i.id AS "invoiceId", sp.name AS supplier, i."documentType" AS "documentType",
          i."pointOfSale" AS "pointOfSale", i."documentNumber" AS "documentNumber",
          i."issuedOn" AS "issuedOn", d."dueOn" AS "dueOn",
          (d."amountMinor" - coalesce((
            SELECT sum(a."amountMinor") FROM "SupplierPayableAllocation" a
            JOIN "SupplierPayablePayment" pay ON pay.id = a."paymentId"
            WHERE a."dueId" = d.id AND pay."voidedAt" IS NULL
          ), 0))::bigint AS balance
        FROM "SupplierPayableDue" d
        JOIN "SupplierPayableInvoice" i ON i.id = d."invoiceId"
        JOIN "Supplier" sp ON sp.id = i."supplierId"
        WHERE i."organizationId" = ${organizationId}::uuid
          AND i."branchId" = ANY(${branchIds}::uuid[])`,
      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          current: bigint;
          previous: bigint;
          quantity: number;
        }[]
      >`
        WITH items AS (
          SELECT ri."productId", ri."unitCostMinor", ri.quantity, r."createdAt",
            row_number() OVER (PARTITION BY ri."productId", r."createdAt" >= ${period.start}
              ORDER BY r."createdAt" DESC, ri.id DESC) AS rank
          FROM "PurchaseReceipt" r JOIN "PurchaseReceiptItem" ri ON ri."receiptId" = r.id
          WHERE r."organizationId" = ${organizationId}::uuid
            AND r."branchId" = ANY(${branchIds}::uuid[]) AND r."createdAt" < ${period.end}
        ), cur AS (
          SELECT "productId", "unitCostMinor" FROM items
          WHERE rank = 1 AND "createdAt" >= ${period.start}
        ), prev AS (
          SELECT "productId", "unitCostMinor" FROM items
          WHERE rank = 1 AND "createdAt" < ${period.start}
        ), qty AS (
          SELECT "productId", sum(quantity)::int AS quantity FROM items
          WHERE "createdAt" >= ${period.start} GROUP BY 1
        )
        SELECT p.id, p.name, cur."unitCostMinor" AS current, prev."unitCostMinor" AS previous,
          qty.quantity
        FROM cur JOIN prev ON prev."productId" = cur."productId"
        JOIN qty ON qty."productId" = cur."productId"
        JOIN "Product" p ON p.id = cur."productId"`,
      this.prisma.$queryRaw<
        {
          purchaseId: string;
          supplier: string;
          reference: string | null;
          orderedAt: Date | null;
          ordered: number;
          received: number;
          remaining: number;
          value: bigint;
        }[]
      >`
        SELECT pu.id AS "purchaseId", sp.name AS supplier, pu.reference,
          pu."orderedAt" AS "orderedAt",
          sum(pi."orderedQuantity")::int AS ordered,
          sum(pi."receivedQuantity")::int AS received,
          sum(greatest(pi."orderedQuantity" - pi."receivedQuantity" - pi."cancelledQuantity", 0))::int AS remaining,
          sum(greatest(pi."orderedQuantity" - pi."receivedQuantity" - pi."cancelledQuantity", 0)
            * pi."unitCostMinor")::bigint AS value
        FROM "Purchase" pu
        JOIN "PurchaseItem" pi ON pi."purchaseId" = pu.id
        JOIN "Supplier" sp ON sp.id = pu."supplierId"
        WHERE pu."organizationId" = ${organizationId}::uuid
          AND pu."branchId" = ANY(${branchIds}::uuid[])
          AND pu.status IN ('ORDERED', 'PARTIALLY_RECEIVED')
        GROUP BY pu.id, sp.name
        HAVING sum(greatest(pi."orderedQuantity" - pi."receivedQuantity" - pi."cancelledQuantity", 0)) > 0
        ORDER BY pu."orderedAt" ASC NULLS LAST`,
    ]);

    const total = [...trend.values()].reduce((sum, value) => sum + value, 0n);
    const buckets = trendBuckets(period, unit);
    const previousBuckets = previous ? trendBuckets(previous, unit) : [];
    const open = dues.filter((due) => due.balance > 0n);
    const overdue = (due: (typeof open)[number]) =>
      due.dueOn !== null && civil(due.dueOn) < today;
    const invoices = new Map<
      string,
      (typeof open)[number] & { days: number }
    >();
    for (const due of open) {
      const days = overdue(due) ? daysBetween(civil(due.dueOn!), today) : 0;
      const found = invoices.get(due.invoiceId);
      // Una fila por factura: saldo de todas sus cuotas, la mora de la más vieja.
      invoices.set(due.invoiceId, {
        ...due,
        dueOn:
          found?.dueOn && (!due.dueOn || found.dueOn < due.dueOn)
            ? found.dueOn
            : due.dueOn,
        balance: (found?.balance ?? 0n) + due.balance,
        days: Math.max(found?.days ?? 0, days),
      });
    }
    const change = weightedCostChange(costs);

    return {
      meta: reportMeta("purchases", scope, now),
      kpis: {
        received: kpi("money", total, previousTotal?.[0]?.amount ?? null),
        activeSuppliers: kpi("count", active, previousActive),
        pendingInvoices: kpi("count", invoices.size, null),
        costChange:
          change === null
            ? unavailableKpi("percent", "INSUFFICIENT_HISTORY")
            : {
                ...kpi("percent", 0, null),
                value: change.toString(),
                changePct: null,
                changePp: null,
              },
      },
      charts: {
        trendUnit: unit,
        trend: buckets.map((bucket, index) => ({
          bucket,
          value: (trend.get(bucket) ?? 0n).toString(),
          previous: previousTrend
            ? (previousTrend.get(previousBuckets[index] ?? "") ?? 0n).toString()
            : null,
        })),
        suppliers: suppliers.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.amount.toString(),
          sharePct: sharePct(row.amount, total),
        })),
      },
      tables: {
        invoicedMinor: (invoiced[0]?.amount ?? 0n).toString(),
        pendingInvoices: [...invoices.values()]
          .sort(
            (left, right) =>
              right.days - left.days ||
              (left.dueOn?.getTime() ?? Infinity) -
                (right.dueOn?.getTime() ?? Infinity),
          )
          .slice(0, 50)
          .map((row) => ({
            id: row.invoiceId,
            supplier: row.supplier,
            document: `${row.documentType} ${row.pointOfSale}-${row.documentNumber}`,
            issuedOn: civil(row.issuedOn),
            dueOn: row.dueOn ? civil(row.dueOn) : null,
            balanceMinor: row.balance.toString(),
            daysOverdue: row.days,
          })),
        pendingTotals: {
          balanceMinor: open
            .reduce((sum, due) => sum + due.balance, 0n)
            .toString(),
          overdueMinor: open
            .filter(overdue)
            .reduce((sum, due) => sum + due.balance, 0n)
            .toString(),
        },
        costIncreases: costs
          .filter((row) => row.previous > 0n && row.current > row.previous)
          .map((row) => ({
            id: row.id,
            name: row.name,
            previousCostMinor: row.previous.toString(),
            currentCostMinor: row.current.toString(),
            changePct:
              Number(((row.current - row.previous) * 1000n) / row.previous) /
              10,
          }))
          .sort((left, right) => right.changePct - left.changePct)
          .slice(0, 15),
        pendingReceipts: pending.slice(0, 50).map((row) => ({
          purchaseId: row.purchaseId,
          supplier: row.supplier,
          reference: row.reference,
          orderedAt: row.orderedAt?.toISOString() ?? null,
          ordered: row.ordered,
          received: row.received,
          remaining: row.remaining,
          remainingValueMinor: row.value.toString(),
          daysWaiting: row.orderedAt
            ? daysBetween(argentineDate(row.orderedAt), today)
            : null,
        })),
      },
    };
  }

  /** Recibido (cantidad × costo) por tramo de la fecha de recepción. */
  private async received(receipts: Prisma.Sql, unit: string) {
    const rows = await this.prisma.$queryRaw<
      { bucket: string; amount: bigint }[]
    >`
      SELECT to_char(date_trunc(${unit}, r."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
        sum(ri.quantity * ri."unitCostMinor")::bigint AS amount
      FROM "PurchaseReceipt" r JOIN "PurchaseReceiptItem" ri ON ri."receiptId" = r.id
      WHERE ${receipts} GROUP BY 1`;
    return new Map(rows.map((row) => [row.bucket, row.amount]));
  }

  /** Proveedores con al menos una recepción o factura en el rango. */
  private async activeSuppliers(
    organizationId: string,
    branchIds: string[],
    range: ReportRange,
  ) {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(DISTINCT id)::int AS count FROM (
        SELECT pu."supplierId" AS id FROM "PurchaseReceipt" r
        JOIN "Purchase" pu ON pu.id = r."purchaseId"
        WHERE r."organizationId" = ${organizationId}::uuid
          AND r."branchId" = ANY(${branchIds}::uuid[])
          AND r."createdAt" >= ${range.start} AND r."createdAt" < ${range.end}
        UNION ALL
        SELECT "supplierId" FROM "SupplierPayableInvoice"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "branchId" = ANY(${branchIds}::uuid[])
          AND "issuedOn" >= ${range.from}::date AND "issuedOn" <= ${range.to}::date
      ) s`;
    return row?.count ?? 0;
  }
}
