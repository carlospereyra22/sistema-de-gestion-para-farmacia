import type { AccountItems } from "./api";
export function paymentAllocationSummary(
  items: AccountItems["items"],
  chosen: Record<string, string>,
  partialItems?: Set<string>,
) {
  return [...new Set(items.map((item) => item.saleId))]
    .map((saleId) => {
      const rows = items.filter((item) => item.saleId === saleId);
      const pending = rows.reduce(
        (sum, item) => sum + Number(item.pendingMinor),
        0,
      );
      const applied = rows.reduce(
        (sum, item) =>
          sum + Math.round(Number(chosen[item.saleItemId] ?? 0) * 100),
        0,
      );
      const remaining = partialItems
        ? rows.reduce(
            (sum, item) =>
              sum +
              (chosen[item.saleItemId] === undefined
                ? Number(item.pendingMinor)
                : partialItems.has(item.saleItemId)
                  ? Number(item.pendingMinor) -
                    Math.round(Number(chosen[item.saleItemId]) * 100)
                  : 0),
            0,
          )
        : pending - applied;
      return { saleId, pending, applied, remaining };
    })
    .filter(
      (row) =>
        Number.isSafeInteger(row.applied) &&
        row.applied > 0 &&
        row.remaining >= 0,
    );
}
export function dueSaleSelection(data: AccountItems, saleId: string) {
  if (data.unassignedReceipts.length) return null;
  const groups = [
    ...new Set(
      data.items
        .filter((item) => Number(item.pendingMinor) > 0)
        .map((item) => item.saleId),
    ),
  ];
  const index = groups.indexOf(saleId);
  if (index < 0) return null;
  const items = data.items.filter(
    (item) => item.saleId === saleId && Number(item.pendingMinor) > 0,
  );
  return {
    page: Math.floor(index / 5) + 1,
    chosen: Object.fromEntries(
      items.map((item) => [
        item.saleItemId,
        String(Number(item.pendingMinor) / 100),
      ]),
    ),
  };
}
