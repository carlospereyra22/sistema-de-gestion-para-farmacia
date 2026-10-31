import type { CatalogProduct, StockLot } from "./api";

export function matchesCatalogExtras(
  product: Pick<
    CatalogProduct,
    | "id"
    | "name"
    | "brand"
    | "barcodes"
    | "laboratory"
    | "externalReferenceSource"
    | "externalReferenceName"
  >,
  stock: Pick<
    StockLot,
    "productId" | "quantity" | "expiresAt" | "expiryStatus"
  >[],
  query: string,
  expiry: string,
  reference: string,
) {
  const text = `${product.name} ${product.brand ?? ""} ${product.laboratory?.name ?? ""} ${product.barcodes.map((b) => b.code).join(" ")}`;
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  if (!normalize(text).includes(normalize(query.trim()))) return false;
  const linked = Boolean(
    product.externalReferenceSource && product.externalReferenceName,
  );
  if (
    (reference === "linked" && !linked) ||
    (reference === "unlinked" && linked)
  )
    return false;
  if (!expiry) return true;
  return stock.some(
    (lot) =>
      lot.productId === product.id &&
      lot.quantity > 0 &&
      (expiry === "expired"
        ? lot.expiryStatus === "EXPIRED"
        : expiry === "expiring"
          ? lot.expiryStatus === "EXPIRING_SOON"
          : expiry === "undated"
            ? !lot.expiresAt
            : false),
  );
}
