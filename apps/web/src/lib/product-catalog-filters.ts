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
  now = new Date(),
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
    (lot) => lot.productId === product.id && lotMatchesExpiry(lot, expiry, now),
  );
}

// Criterio del filtro Vencimiento para un lote; también decide qué lotes se
// ven en el detalle desplegable de Productos.
export function lotMatchesExpiry(
  lot: Pick<StockLot, "quantity" | "expiresAt" | "expiryStatus">,
  expiry: string,
  now = new Date(),
) {
  if (!expiry) return true;
  return (
    lot.quantity > 0 &&
    (expiry === "expired"
      ? lot.expiryStatus === "EXPIRED"
      : expiry === "expiring"
        ? lot.expiryStatus === "EXPIRING_SOON"
        : Object.hasOwn(expiringWindowDays, expiry)
          ? expiresWithin(lot, expiringWindowDays[expiry], now)
          : expiry === "undated"
            ? !lot.expiresAt
            : false)
  );
}

// Ventanas cortas dentro de "próximos 90 días": parten del mismo estado que
// informa el servidor y se acotan por la fecha del lote.
const expiringWindowDays: Record<string, number> = {
  "expiring-60": 60,
  "expiring-30": 30,
};

function expiresWithin(
  lot: Pick<StockLot, "expiresAt" | "expiryStatus">,
  days: number,
  now: Date,
) {
  if (lot.expiryStatus !== "EXPIRING_SOON" || !lot.expiresAt) return false;
  return new Date(lot.expiresAt).getTime() <= now.getTime() + days * 86_400_000;
}
