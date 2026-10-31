import type { CatalogProduct } from "./api";
export type CatalogAdditionalFilters = {
  brand?: string;
  kind?: string;
  reference: string;
  image: string;
  barcode: string;
};
export const emptyCatalogAdditionalFilters: CatalogAdditionalFilters = {
  reference: "",
  image: "",
  barcode: "",
};
export function matchesCatalogAdditionalFilters(
  product: Pick<
    CatalogProduct,
    | "image"
    | "barcodes"
    | "externalReferenceSource"
    | "externalReferenceName"
    | "brand"
    | "isMedication"
  >,
  filters: CatalogAdditionalFilters,
) {
  const linked = Boolean(
    product.externalReferenceSource && product.externalReferenceName,
  );
  return (
    (!filters.brand ||
      (product.brand ?? "").toLocaleLowerCase("es") ===
        filters.brand.toLocaleLowerCase("es")) &&
    (!filters.kind ||
      (filters.kind === "medicine"
        ? product.isMedication === true
        : product.isMedication !== true)) &&
    (!filters.reference ||
      (filters.reference === "linked" ? linked : !linked)) &&
    (!filters.image ||
      (filters.image === "with" ? Boolean(product.image) : !product.image)) &&
    (!filters.barcode ||
      (filters.barcode === "with"
        ? product.barcodes.length > 0
        : product.barcodes.length === 0))
  );
}
