import type { CatalogProduct } from "./api";

export type SaleCatalogStock = { available: number; expired: number };
export type SaleCatalogFilters = {
  query: string;
  categoryId: string;
  inStockOnly: boolean;
};

type SaleCatalogProduct = Pick<
  CatalogProduct,
  | "id"
  | "name"
  | "activeIngredient"
  | "concentration"
  | "pharmaceuticalForm"
  | "presentation"
  | "barcodes"
  | "category"
>;

export const saleCatalogRowId = (idPrefix: string, productId: string) =>
  `${idPrefix}-${productId}`;

export function saleCatalogDetail(product: SaleCatalogProduct): string {
  return [
    product.activeIngredient,
    product.concentration,
    product.pharmaceuticalForm,
    product.presentation,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .join(" · ");
}

// El lector entra por el mismo buscador: el codigo de barras tambien es texto buscable.
export function filterSaleCatalog<T extends SaleCatalogProduct>(
  products: readonly T[],
  stockOf: (productId: string) => SaleCatalogStock,
  filters: SaleCatalogFilters,
): T[] {
  const term = filters.query.trim().toLocaleLowerCase("es-AR");
  return products.filter(
    (product) =>
      (!filters.categoryId || product.category?.id === filters.categoryId) &&
      (!filters.inStockOnly || stockOf(product.id).available > 0) &&
      (!term ||
        [
          product.name,
          product.activeIngredient ?? "",
          ...product.barcodes.map((barcode) => barcode.code),
        ]
          .join(" ")
          .toLocaleLowerCase("es-AR")
          .includes(term)),
  );
}

export function saleCategoryOptions(
  products: readonly SaleCatalogProduct[],
): { value: string; label: string }[] {
  const categories = new Map<string, string>();
  for (const product of products)
    if (product.category)
      categories.set(product.category.id, product.category.name);
  return [
    { value: "", label: "Todas las categorías" },
    ...[...categories]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es-AR")),
  ];
}

export function nextSaleCatalogSelection(
  rows: readonly { id: string }[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined {
  if (!rows.length) return undefined;
  const index = rows.findIndex((row) => row.id === currentId);
  if (index < 0) return rows[direction === 1 ? 0 : rows.length - 1]!.id;
  return rows[Math.max(0, Math.min(rows.length - 1, index + direction))]!.id;
}
