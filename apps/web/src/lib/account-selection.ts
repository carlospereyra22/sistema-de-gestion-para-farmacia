import { accountPendingPreview } from "./account-pending-preview";
type PendingItem = { saleItemId: string; pendingMinor: string };
export function adjustedPendingItems<T extends PendingItem>(
  items: T[],
  adjusted: Record<string, string>,
  enabled = true,
): T[] {
  return items.map((item) => ({
    ...item,
    pendingMinor: String(
      accountPendingPreview(
        item.pendingMinor,
        adjusted[item.saleItemId],
        enabled,
      ),
    ),
  }));
}
export function selectPendingItems(
  current: Record<string, string>,
  items: PendingItem[],
  checked: boolean,
) {
  const next = { ...current };
  for (const item of items) {
    if (checked && Number(item.pendingMinor) > 0)
      next[item.saleItemId] = String(Number(item.pendingMinor) / 100);
    else delete next[item.saleItemId];
  }
  return next;
}
export function pendingSelectionState(
  chosen: Record<string, string>,
  items: PendingItem[],
) {
  const pending = items.filter((item) => Number(item.pendingMinor) > 0);
  const checked =
    pending.length > 0 &&
    pending.every(
      (item) =>
        Math.round(Number(chosen[item.saleItemId] ?? 0) * 100) ===
        Number(item.pendingMinor),
    );
  return {
    checked,
    partial:
      !checked && pending.some((item) => chosen[item.saleItemId] !== undefined),
  };
}
