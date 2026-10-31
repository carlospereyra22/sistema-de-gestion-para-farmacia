// Presentation only: original sale items and their lot traceability stay intact.
export function groupTicketItems<
  T extends {
    productId: string | null;
    description?: string | null;
    quantity: number;
    unitPriceMinor: bigint;
  },
>(
  items: T[],
): {
  productId: string | null;
  description?: string | null;
  quantity: number;
  unitPriceMinor: bigint;
}[] {
  const grouped = new Map<
    string,
    {
      productId: string | null;
      description?: string | null;
      quantity: number;
      unitPriceMinor: bigint;
    }
  >();
  for (const item of items) {
    const key = JSON.stringify([
      item.productId,
      item.unitPriceMinor.toString(),
      item.productId === null ? grouped.size : null,
    ]);
    const existing = grouped.get(key);
    if (existing) existing.quantity += item.quantity;
    else
      grouped.set(key, {
        productId: item.productId,
        ...(item.description ? { description: item.description } : {}),
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      });
  }
  return [...grouped.values()];
}
