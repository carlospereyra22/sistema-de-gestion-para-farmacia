import type { ReportLoyalty, ReportLoyaltySegment } from "@gestion/contracts";

/**
 * Fidelidad de clientes (SISTEMA-117). Reglas puras, probadas sin base.
 * Sólo cuentan ventas con cliente identificado.
 */

const DAY = 86400000;

export type LoyaltyCustomer = {
  id: string;
  name: string;
  firstAt: Date;
  /** Mes local (Argentina) de la primera compra: "2026-10". */
  firstMonth: string;
  /** Última compra hasta el fin del período. */
  lastAt: Date;
  /** Compras (tickets) hasta el fin del período. */
  lifetime: number;
  /**
   * Días distintos con compra hasta el fin del período: dos tickets en la
   * misma tarde son una sola visita. La frecuencia se mide en visitas.
   */
  visits: number;
  lifetimeSpend: bigint;
  inPeriod: number;
  periodSpend: bigint;
  inPrevious: number;
};

/** Días promedio entre visitas; null con una sola visita. */
export function usualDays(
  customer: Pick<LoyaltyCustomer, "firstAt" | "lastAt" | "visits">,
) {
  if (customer.visits < 2) return null;
  return Math.max(
    1,
    Math.round(
      (customer.lastAt.getTime() - customer.firstAt.getTime()) /
        DAY /
        (customer.visits - 1),
    ),
  );
}

/**
 * Segmento según la última compra y la frecuencia habitual del cliente:
 * - perdido: más de 120 días sin comprar;
 * - en riesgo: superó 1,5 veces su frecuencia (mínimo 30 días), o compró una
 *   sola vez y no volvió en 60 días;
 * - nuevo: su primera compra fue en el período;
 * - frecuente: 4 o más compras, cada 30 días o menos;
 * - regular: el resto de los activos.
 */
export function loyaltySegment(
  customer: LoyaltyCustomer,
  reference: Date,
  periodStart: Date,
): ReportLoyaltySegment {
  const since = (reference.getTime() - customer.lastAt.getTime()) / DAY;
  const usual = usualDays(customer);
  if (since > 120) return "lost";
  if (usual === null ? since > 60 : since > Math.max(30, usual * 1.5))
    return "atRisk";
  if (customer.firstAt >= periodStart) return "new";
  if (customer.visits >= 4 && usual !== null && usual <= 30) return "frequent";
  return "regular";
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export const FREQUENCY_BUCKETS = [
  { id: "once", name: "Una sola compra", max: null },
  { id: "7", name: "Cada semana", max: 7 },
  { id: "15", name: "Cada 2 semanas", max: 15 },
  { id: "30", name: "Cada mes", max: 30 },
  { id: "60", name: "Cada 2 meses", max: 60 },
  { id: "90", name: "Cada 3 meses", max: 90 },
  { id: "more", name: "Menos seguido", max: Infinity },
] as const;

export function frequencyBucket(days: number | null) {
  if (days === null) return "once";
  return FREQUENCY_BUCKETS.find(
    (bucket) => bucket.max !== null && days <= bucket.max,
  )!.id;
}

/** "2026-10" del mes siguiente (o `offset` meses después). */
export function addMonths(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Cohortes por mes de primera compra (las últimas `count` hasta `lastMonth`):
 * `retention[i]` = % de la cohorte con alguna compra en el mes i+1 después.
 */
export function cohorts(
  months: ReadonlyMap<string, ReadonlySet<string>>,
  firstMonth: ReadonlyMap<string, string>,
  lastMonth: string,
  count = 6,
  horizon = 5,
): ReportLoyalty["cohorts"] {
  const result: ReportLoyalty["cohorts"] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const month = addMonths(lastMonth, -back);
    const members = [...firstMonth]
      .filter(([, first]) => first === month)
      .map(([id]) => id);
    if (!members.length) continue;
    const retention: (number | null)[] = [];
    for (let step = 1; step <= horizon; step += 1) {
      const target = addMonths(month, step);
      if (target > lastMonth) {
        retention.push(null);
        continue;
      }
      const back = members.filter((id) => months.get(id)?.has(target)).length;
      retention.push(Math.round((back / members.length) * 1000) / 10);
    }
    result.push({ month, customers: members.length, retention });
  }
  return result;
}

export function loyaltySummary({
  customers,
  reference,
  periodStart,
  hasPrevious,
  newVsReturning,
  months,
  lastMonth,
  identifiedSharePct,
}: {
  customers: readonly LoyaltyCustomer[];
  reference: Date;
  periodStart: Date;
  hasPrevious: boolean;
  newVsReturning: ReportLoyalty["newVsReturning"];
  months: ReadonlyMap<string, ReadonlySet<string>>;
  /** Mes local del fin del período. */
  lastMonth: string;
  identifiedSharePct: number | null;
}): ReportLoyalty {
  const active = customers.filter((customer) => customer.inPeriod > 0);
  const returning = active.filter((customer) => customer.firstAt < periodStart);
  const previous = customers.filter((customer) => customer.inPrevious > 0);
  const kept = previous.filter((customer) => customer.inPeriod > 0);
  const pct = (part: number, whole: number) =>
    whole ? Math.round((part / whole) * 1000) / 10 : null;
  const segmented = customers.map((customer) => ({
    customer,
    segment: loyaltySegment(customer, reference, periodStart),
  }));
  const segments: ReportLoyaltySegment[] = [
    "frequent",
    "regular",
    "new",
    "atRisk",
    "lost",
  ];
  const purchases = active.reduce(
    (sum, customer) => sum + customer.inPeriod,
    0,
  );
  const spend = active.reduce(
    (sum, customer) => sum + customer.periodSpend,
    0n,
  );
  const firstMonth = new Map(
    customers.map((customer) => [customer.id, customer.firstMonth]),
  );

  return {
    identifiedSharePct,
    returningPct: pct(returning.length, active.length),
    retentionPct: hasPrevious ? pct(kept.length, previous.length) : null,
    newCustomers: active.length - returning.length,
    returningCustomers: returning.length,
    medianDaysBetween: median(
      customers.map(usualDays).filter((days): days is number => days !== null),
    ),
    purchasesPerCustomer: active.length
      ? Math.round((purchases / active.length) * 10) / 10
      : null,
    spendPerCustomerMinor: active.length
      ? (spend / BigInt(active.length)).toString()
      : null,
    segments: segments.map((id) => {
      const members = segmented.filter((row) => row.segment === id);
      return {
        id,
        customers: members.length,
        lifetimeMinor: members
          .reduce((sum, row) => sum + row.customer.lifetimeSpend, 0n)
          .toString(),
      };
    }),
    newVsReturning,
    frequency: FREQUENCY_BUCKETS.map((bucket) => ({
      id: bucket.id,
      name: bucket.name,
      customers: customers.filter(
        (customer) => frequencyBucket(usualDays(customer)) === bucket.id,
      ).length,
    })),
    cohorts: cohorts(months, firstMonth, lastMonth),
    toRecover: segmented
      .filter((row) => row.segment === "atRisk" || row.segment === "lost")
      .sort((left, right) =>
        right.customer.lifetimeSpend > left.customer.lifetimeSpend ? 1 : -1,
      )
      .slice(0, 20)
      .map(({ customer, segment }) => ({
        id: customer.id,
        name: customer.name,
        lastPurchaseAt: customer.lastAt.toISOString(),
        daysSince: Math.floor(
          (reference.getTime() - customer.lastAt.getTime()) / DAY,
        ),
        usualDays: usualDays(customer),
        purchases: customer.visits,
        lifetimeMinor: customer.lifetimeSpend.toString(),
        segment,
      })),
  };
}
