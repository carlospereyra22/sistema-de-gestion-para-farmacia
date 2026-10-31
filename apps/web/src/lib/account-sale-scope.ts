import type { AccountItems } from "./api";

/** A collection opened from a sale must never allocate to a different sale. */
export function scopeAccountItems(
  data: AccountItems,
  saleId?: string,
): AccountItems {
  if (!saleId) return data;
  const items = data.items.filter((item) => item.saleId === saleId);
  return {
    ...data,
    items,
    balanceMinor: items
      .reduce((sum, item) => sum + BigInt(item.pendingMinor), 0n)
      .toString(),
    mixedSales: data.mixedSales.filter((sale) => sale.saleId === saleId),
  };
}
