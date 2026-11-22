import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ReportCustomers } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ReportAccessService } from "./report-access.service";
import type { ReportFiltersQuery } from "./report-filters.dto";
import { kpi, sharePct, trendBuckets } from "./report-math";
import { argentineDate, type ReportRange } from "./report-period";
import { salesWhere, TZ } from "./report-sales-data";
import {
  civil,
  daysBetween,
  reportMeta,
  rejectFilters,
  requireAccess,
  trendUnitOf,
} from "./report-tab-helpers";

export const AGING_BUCKETS = [
  { id: "current", name: "Al día" },
  { id: "1-30", name: "1 a 30 días" },
  { id: "31-60", name: "31 a 60 días" },
  { id: "61-90", name: "61 a 90 días" },
  { id: "91-120", name: "91 a 120 días" },
  { id: "120+", name: "Más de 120 días" },
  { id: "undated", name: "Sin vencimiento" },
] as const;

export type AgingId = (typeof AGING_BUCKETS)[number]["id"];

export function agingBucket(dueOn: string | null, today: string): AgingId {
  if (!dueOn) return "undated";
  const late = daysBetween(dueOn, today);
  if (late <= 0) return "current";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  if (late <= 120) return "91-120";
  return "120+";
}

/**
 * Antigüedad de un saldo: se imputa a las ventas a cuenta de la más nueva a la
 * más vieja (los cobros saldan primero lo más viejo, FIFO). Lo que no alcanza a
 * cubrir una venta queda "Sin vencimiento".
 */
export function ageBalance(
  balance: bigint,
  sales: readonly { amount: bigint; dueOn: string | null }[],
  today: string,
) {
  const parts: { bucket: AgingId; amount: bigint; daysLate: number }[] = [];
  let left = balance;
  const newestFirst = [...sales].sort((a, b) =>
    (b.dueOn ?? "9999").localeCompare(a.dueOn ?? "9999"),
  );
  for (const sale of newestFirst) {
    if (left <= 0n) break;
    const amount = sale.amount < left ? sale.amount : left;
    if (amount <= 0n) continue;
    left -= amount;
    parts.push({
      bucket: agingBucket(sale.dueOn, today),
      amount,
      daysLate: sale.dueOn ? Math.max(0, daysBetween(sale.dueOn, today)) : 0,
    });
  }
  if (left > 0n) parts.push({ bucket: "undated", amount: left, daysLate: 0 });
  return parts;
}

/**
 * Pestaña Clientes y cuentas corrientes (SISTEMA-116). Saldo = débitos −
 * créditos; cobrado = créditos con medio de pago (los créditos sin medio son
 * anulaciones o notas de crédito: bajan la deuda pero no son cobros). Nunca
 * muestra DNI, CUIT ni teléfono.
 */
@Injectable()
export class ReportCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportAccessService,
  ) {}

  async customers(
    actorId: string,
    organizationId: string,
    query: ReportFiltersQuery,
    now = new Date(),
  ): Promise<ReportCustomers> {
    rejectFilters(query, ["granularity"], "Clientes");
    const scope = await this.access.scope(actorId, organizationId, query, now);
    requireAccess(scope.access, "customers");
    const { period, branchIds } = scope;
    const unit = trendUnitOf(query, period);
    const today = argentineDate(now);
    const previous = period.previous;
    const movements = Prisma.sql`
      m."organizationId" = ${organizationId}::uuid
      AND m."branchId" = ANY(${branchIds}::uuid[])`;
    const inRange = (range: ReportRange) =>
      Prisma.sql`m."createdAt" >= ${range.start} AND m."createdAt" < ${range.end}`;

    const [
      active,
      previousActive,
      collected,
      previousCollected,
      trend,
      previousTrend,
      top,
      balances,
      accountSales,
      collections,
      lastPayments,
    ] = await Promise.all([
      this.activeCustomers(organizationId, branchIds, period),
      previous
        ? this.activeCustomers(organizationId, branchIds, previous)
        : null,
      this.collected(movements, inRange(period)),
      previous ? this.collected(movements, inRange(previous)) : null,
      this.trend(movements, inRange(period), unit),
      previous ? this.trend(movements, inRange(previous), unit) : null,
      this.prisma.$queryRaw<
        { id: string; name: string; amount: bigint; tickets: number }[]
      >`
        SELECT c.id, c.name, sum(s."totalMinor")::bigint AS amount,
          count(*)::int AS tickets
        FROM "Sale" s JOIN "Customer" c ON c.id = s."customerId"
        WHERE ${salesWhere(organizationId, branchIds, period)}
        GROUP BY c.id, c.name ORDER BY amount DESC LIMIT 10`,
      this.prisma.$queryRaw<{ id: string; name: string; balance: bigint }[]>`
        SELECT c.id, c.name,
          sum(CASE WHEN m.type = 'DEBIT' THEN m."amountMinor" ELSE -m."amountMinor" END)::bigint AS balance
        FROM "CustomerAccountMovement" m JOIN "Customer" c ON c.id = m."customerId"
        WHERE ${movements} GROUP BY c.id, c.name`,
      this.prisma.$queryRaw<
        { customerId: string; amount: bigint; dueOn: Date | null }[]
      >`
        SELECT m."customerId" AS "customerId", m."amountMinor" AS amount,
          s."accountDueDate" AS "dueOn"
        FROM "CustomerAccountMovement" m JOIN "Sale" s ON s.id = m."saleId"
        WHERE ${movements} AND m.type = 'DEBIT'`,
      this.prisma.$queryRaw<
        {
          id: string;
          customer: string;
          branch: string;
          createdAt: Date;
          amount: bigint;
          method: string;
        }[]
      >`
        SELECT m.id, c.name AS customer, b.name AS branch, m."createdAt" AS "createdAt",
          m."amountMinor" AS amount, m."paymentMethod"::text AS method
        FROM "CustomerAccountMovement" m
        JOIN "Customer" c ON c.id = m."customerId"
        JOIN "Branch" b ON b.id = m."branchId"
        WHERE ${movements} AND ${inRange(period)}
          AND m.type = 'CREDIT' AND m."paymentMethod" IS NOT NULL
        ORDER BY m."createdAt" DESC LIMIT 20`,
      this.prisma.$queryRaw<{ customerId: string; last: Date }[]>`
        SELECT m."customerId" AS "customerId", max(m."createdAt") AS last
        FROM "CustomerAccountMovement" m
        WHERE ${movements} AND m.type = 'CREDIT' AND m."paymentMethod" IS NOT NULL
        GROUP BY 1`,
    ]);

    const debtors = balances.filter((row) => row.balance > 0n);
    const balanceTotal = debtors.reduce((sum, row) => sum + row.balance, 0n);
    const salesBy = new Map<
      string,
      { amount: bigint; dueOn: string | null }[]
    >();
    for (const sale of accountSales) {
      const list = salesBy.get(sale.customerId) ?? [];
      list.push({
        amount: sale.amount,
        dueOn: sale.dueOn ? civil(sale.dueOn) : null,
      });
      salesBy.set(sale.customerId, list);
    }
    const aging = new Map<AgingId, bigint>();
    const lastPayment = new Map(
      lastPayments.map((row) => [row.customerId, row.last]),
    );
    const debtorRows = debtors.map((row) => {
      const parts = ageBalance(row.balance, salesBy.get(row.id) ?? [], today);
      for (const part of parts)
        aging.set(part.bucket, (aging.get(part.bucket) ?? 0n) + part.amount);
      const late = parts.filter(
        (part) => part.bucket !== "current" && part.bucket !== "undated",
      );
      return {
        id: row.id,
        name: row.name,
        balanceMinor: row.balance.toString(),
        overdueMinor: late
          .reduce((sum, part) => sum + part.amount, 0n)
          .toString(),
        oldestDaysOverdue: Math.max(0, ...late.map((part) => part.daysLate)),
        lastPaymentAt: lastPayment.get(row.id)?.toISOString() ?? null,
        balance: row.balance,
      };
    });
    const buckets = trendBuckets(period, unit);
    const previousBuckets = previous ? trendBuckets(previous, unit) : [];
    const topTotal = top.reduce((sum, row) => sum + row.amount, 0n);

    return {
      meta: reportMeta("customers", scope, now),
      kpis: {
        activeCustomers: kpi("count", active, previousActive),
        accountBalance: kpi("money", balanceTotal, null),
        collected: kpi("money", collected, previousCollected),
        debtors: kpi("count", debtors.length, null),
      },
      charts: {
        trendUnit: unit,
        trend: buckets.map((bucket, index) => ({
          bucket,
          soldOnAccountMinor: (trend.get(bucket)?.sold ?? 0n).toString(),
          collectedMinor: (trend.get(bucket)?.collected ?? 0n).toString(),
          previousCollectedMinor: previousTrend
            ? (
                previousTrend.get(previousBuckets[index] ?? "")?.collected ?? 0n
              ).toString()
            : null,
        })),
        topCustomers: top.map((row) => ({
          id: row.id,
          name: row.name,
          value: row.amount.toString(),
          sharePct: sharePct(row.amount, topTotal),
          tickets: row.tickets,
        })),
        aging: AGING_BUCKETS.map((bucket) => ({
          id: bucket.id,
          name: bucket.name,
          value: (aging.get(bucket.id) ?? 0n).toString(),
        })),
      },
      tables: {
        debtors: debtorRows
          .sort((left, right) => (right.balance > left.balance ? 1 : -1))
          .slice(0, 20)
          .map((row) => ({
            id: row.id,
            name: row.name,
            balanceMinor: row.balanceMinor,
            overdueMinor: row.overdueMinor,
            oldestDaysOverdue: row.oldestDaysOverdue,
            lastPaymentAt: row.lastPaymentAt,
          })),
        collections: collections.map((row) => ({
          id: row.id,
          customer: row.customer,
          branch: row.branch,
          createdAt: row.createdAt.toISOString(),
          amountMinor: row.amount.toString(),
          method: row.method,
        })),
      },
    };
  }

  private async activeCustomers(
    organizationId: string,
    branchIds: string[],
    range: ReportRange,
  ) {
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(DISTINCT s."customerId")::int AS count FROM "Sale" s
      WHERE ${salesWhere(organizationId, branchIds, range)} AND s."customerId" IS NOT NULL`;
    return row?.count ?? 0;
  }

  private async collected(movements: Prisma.Sql, range: Prisma.Sql) {
    const [row] = await this.prisma.$queryRaw<{ amount: bigint }[]>`
      SELECT coalesce(sum(m."amountMinor"), 0)::bigint AS amount
      FROM "CustomerAccountMovement" m
      WHERE ${movements} AND ${range}
        AND m.type = 'CREDIT' AND m."paymentMethod" IS NOT NULL`;
    return row?.amount ?? 0n;
  }

  /** Vendido a cuenta (débitos de ventas) y cobrado por tramo. */
  private async trend(movements: Prisma.Sql, range: Prisma.Sql, unit: string) {
    const rows = await this.prisma.$queryRaw<
      { bucket: string; sold: bigint; collected: bigint }[]
    >`
      SELECT to_char(date_trunc(${unit}, m."createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS bucket,
        coalesce(sum(m."amountMinor") FILTER (WHERE m.type = 'DEBIT' AND m."saleId" IS NOT NULL), 0)::bigint AS sold,
        coalesce(sum(m."amountMinor") FILTER (WHERE m.type = 'CREDIT' AND m."paymentMethod" IS NOT NULL), 0)::bigint AS collected
      FROM "CustomerAccountMovement" m WHERE ${movements} AND ${range} GROUP BY 1`;
    return new Map(
      rows.map((row) => [
        row.bucket,
        { sold: row.sold, collected: row.collected },
      ]),
    );
  }
}
