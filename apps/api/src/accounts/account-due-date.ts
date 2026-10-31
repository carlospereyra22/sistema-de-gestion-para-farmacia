// Day arithmetic is performed on UTC representations of civil dates, not instants.
const dayMs = 86400000;
/** Civil calendar date in Argentina, independent of the server's timezone. */
export function accountToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function accountDueDate(
  completedAt: Date,
  days: number | null | undefined,
): Date | null {
  if (days == null) return null;
  if (!Number.isInteger(days) || days < 0 || days > 3650)
    throw new Error("Invalid account term");
  return new Date(
    Date.parse(`${accountToday(completedAt)}T00:00:00Z`) + days * dayMs,
  );
}
export function accountDueStatus(due: Date | null, today: string) {
  if (!due) return { status: "UNDATED" as const, daysOverdue: 0 };
  const difference = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - due.getTime()) / dayMs,
  );
  return {
    status:
      difference > 0
        ? ("OVERDUE" as const)
        : difference === 0
          ? ("TODAY" as const)
          : ("UPCOMING" as const),
    daysOverdue: Math.max(0, difference),
  };
}
