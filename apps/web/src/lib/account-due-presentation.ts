import type { AccountDueRow } from "./account-due-dates";

export function preferredDueSale(rows: AccountDueRow[]): string {
  const rank = (row: AccountDueRow) =>
    row.status === "OVERDUE"
      ? 0
      : row.status === "TODAY" || row.status === "UPCOMING"
        ? 1
        : row.status === "UNDATED"
          ? 2
          : 3;
  return (
    [...rows].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 0 ? b.daysOverdue - a.daysOverdue : 0) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        (a.saleDate ?? "9999").localeCompare(b.saleDate ?? "9999") ||
        a.saleId.localeCompare(b.saleId),
    )[0]?.saleId ?? ""
  );
}

export function chronologicalEvents<T extends { at: string; id: string }>(
  events: T[],
): T[] {
  return [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
}

export function matchesDuePeriod(
  row: AccountDueRow,
  period: string,
  today?: string,
): boolean {
  if (period === "all") return true;
  if (period === "undated") return row.dueDate === null;
  if (!row.dueDate || !today) return false;
  const days =
    (Date.parse(`${row.dueDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
    86400000;
  return period === "today"
    ? days === 0
    : period === "7"
      ? days >= 0 && days <= 7
      : period === "30"
        ? days >= 0 && days <= 30
        : false;
}
