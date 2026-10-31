const productNames = new Intl.Collator("es-AR", {
  sensitivity: "base",
  numeric: true,
});

/** Sort the display only; keep the sale draft and its quantities unchanged. */
export function sortSaleLines<
  T extends { productId: string; description?: string },
>(lines: readonly T[], products: readonly { id: string; name: string }[]): T[] {
  const names = new Map(
    products.map((product) => [product.id, product.name.trim()]),
  );
  return [...lines].sort((left, right) =>
    productNames.compare(
      left.description ?? names.get(left.productId) ?? left.productId,
      right.description ?? names.get(right.productId) ?? right.productId,
    ),
  );
}
