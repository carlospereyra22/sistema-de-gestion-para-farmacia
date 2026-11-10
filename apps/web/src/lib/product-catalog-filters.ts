import { lotesDelProducto, textoEnCache } from "./indice-productos";
import type { CatalogProduct, StockLot } from "./api";

type ProductoFiltrable = Pick<
  CatalogProduct,
  | "id"
  | "name"
  | "brand"
  | "barcodes"
  | "laboratory"
  | "externalReferenceSource"
  | "externalReferenceName"
>;

export function matchesCatalogExtras(
  product: ProductoFiltrable,
  stock: Pick<
    StockLot,
    "productId" | "quantity" | "expiresAt" | "expiryStatus"
  >[],
  query: string,
  expiry: string,
  reference: string,
  now = new Date(),
) {
  // El texto normalizado de cada producto se arma una vez (SISTEMA-74).
  const text = textoEnCache(textos, product, (p) =>
    normalize(
      `${p.name} ${p.brand ?? ""} ${p.laboratory?.name ?? ""} ${p.barcodes.map((b) => b.code).join(" ")}`,
    ),
  );
  if (!text.includes(normalize(query.trim()))) return false;
  const linked = Boolean(
    product.externalReferenceSource && product.externalReferenceName,
  );
  if (
    (reference === "linked" && !linked) ||
    (reference === "unlinked" && linked)
  )
    return false;
  if (!expiry) return true;
  // Sólo los lotes del producto, no todo el stock (SISTEMA-74).
  return lotesDelProducto(stock, product.id).some((lot) =>
    lotMatchesExpiry(lot, expiry, now),
  );
}

const textos = new WeakMap<ProductoFiltrable, string>();
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

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
