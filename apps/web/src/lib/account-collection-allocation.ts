import type { ItemAllocation } from "./api";
export function accountCollectionAllocations(
  items: { saleItemId: string; pendingMinor: string }[],
  chosen: Record<string, string>,
  adjusted: Record<string, string>,
  reconciliation: boolean,
): ItemAllocation[] {
  return Object.entries(chosen).map(([saleItemId, value]) => ({
    saleItemId,
    amountMinor: Math.round(Number(value) * 100),
    ...(!reconciliation && adjusted[saleItemId] !== undefined
      ? {
          expectedPendingMinor: Number(
            items.find((item) => item.saleItemId === saleItemId)
              ?.pendingMinor ?? 0,
          ),
          nextPendingMinor: Math.round(Number(adjusted[saleItemId]) * 100),
        }
      : {}),
  }));
}
