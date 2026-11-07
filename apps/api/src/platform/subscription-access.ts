import { accountToday } from "../accounts/account-due-date";

const COMMERCIAL_DAY_SHIFT_MS = 6 * 60 * 60 * 1000;
const GRACE_DAYS = 10;
const BLOCKED_FROM_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStage =
  | "EXEMPT"
  | "TRIAL"
  | "ACTIVE"
  | "EXTENDED"
  | "GRACE"
  | "READ_ONLY"
  | "BLOCKED"
  | "SUSPENDED"
  | "CANCELLED";

export type SubscriptionAccessLevel = "FULL" | "READ_ONLY" | "BLOCKED";

export type SubscriptionDates = {
  exempt: boolean;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  trialEndsAt: Date | null;
  paidThrough: Date | null;
  extendedUntil: Date | null;
};

/** Las columnas `DATE` llegan a medianoche UTC: su parte de fecha es la fecha civil. */
const civil = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Hasta qué día está cubierta: la fecha más lejana entre pago, prueba y prórroga. */
export function coveredUntil(
  subscription: Pick<
    SubscriptionDates,
    "paidThrough" | "trialEndsAt" | "extendedUntil"
  >,
): string | null {
  return (
    [
      subscription.paidThrough,
      subscription.trialEndsAt,
      subscription.extendedUntil,
    ]
      .flatMap((date) => civil(date) ?? [])
      .sort()
      .at(-1) ?? null
  );
}

export type SubscriptionCut = {
  access: "READ_ONLY" | "BLOCKED";
  on: string;
  inDays: number;
};

/** Cuándo pasa a la restricción siguiente, para avisar antes de cortar. */
export function nextCut(
  result: { stage: SubscriptionStage; daysOverdue: number },
  now: Date,
): SubscriptionCut | null {
  const step =
    result.stage === "GRACE"
      ? (["READ_ONLY", GRACE_DAYS + 1] as const)
      : result.stage === "READ_ONLY"
        ? (["BLOCKED", BLOCKED_FROM_DAY] as const)
        : null;
  if (!step) return null;
  const inDays = step[1] - result.daysOverdue;
  const on = new Date(
    Date.parse(`${commercialToday(now)}T00:00:00.000Z`) + inDays * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  return { access: step[0], on, inDays };
}

/** El día comercial cambia a las 06:00 de Argentina, para no cortar en medio de un turno. */
export function commercialToday(now: Date): string {
  return accountToday(new Date(now.getTime() - COMMERCIAL_DAY_SHIFT_MS));
}

/**
 * El estado se calcula por fechas y no se guarda: el corte no depende de un proceso
 * programado y registrar un pago reactiva al instante.
 */
export function resolveSubscriptionAccess(
  subscription: SubscriptionDates,
  now: Date,
): {
  stage: SubscriptionStage;
  access: SubscriptionAccessLevel;
  daysOverdue: number;
} {
  if (subscription.exempt)
    return { stage: "EXEMPT", access: "FULL", daysOverdue: 0 };
  if (subscription.cancelledAt)
    return { stage: "CANCELLED", access: "BLOCKED", daysOverdue: 0 };
  if (subscription.suspendedAt)
    return { stage: "SUSPENDED", access: "BLOCKED", daysOverdue: 0 };

  const today = commercialToday(now);
  const paid = civil(subscription.paidThrough);
  const trial = civil(subscription.trialEndsAt);
  const extended = civil(subscription.extendedUntil);

  if (paid && paid >= today)
    return { stage: "ACTIVE", access: "FULL", daysOverdue: 0 };
  if (extended && extended >= today)
    return { stage: "EXTENDED", access: "FULL", daysOverdue: 0 };
  if (trial && trial >= today)
    return { stage: "TRIAL", access: "FULL", daysOverdue: 0 };

  // La prórroga solo pausa el corte: al terminar, el atraso se cuenta desde lo pagado o
  // desde el fin de la prueba. Si no, cada prórroga regalaría otros días de gracia.
  const debtFrom = coveredUntil({ ...subscription, extendedUntil: null });
  if (!debtFrom) return { stage: "BLOCKED", access: "BLOCKED", daysOverdue: 0 };
  const daysOverdue = daysBetween(debtFrom, today);
  if (daysOverdue <= GRACE_DAYS)
    return { stage: "GRACE", access: "FULL", daysOverdue };
  if (daysOverdue < BLOCKED_FROM_DAY)
    return { stage: "READ_ONLY", access: "READ_ONLY", daysOverdue };
  return { stage: "BLOCKED", access: "BLOCKED", daysOverdue };
}
