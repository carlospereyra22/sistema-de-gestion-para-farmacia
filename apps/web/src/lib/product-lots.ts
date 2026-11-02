import type { StockLot } from "./api";
import { lotMatchesExpiry } from "./product-catalog-filters";
import { stockLevel } from "./stock-level";

type Lot = Pick<
  StockLot,
  "id" | "productId" | "number" | "quantity" | "expiresAt" | "expiryStatus"
>;

// Lotes con existencias de un producto, en el orden en que se venden:
// primero el que vence antes y al final los que no tienen fecha.
export function productLots<T extends Lot>(stock: T[], productId: string) {
  return stock
    .filter((lot) => lot.productId === productId && lot.quantity > 0)
    .sort(byExpiry);
}

function byExpiry(left: Pick<Lot, "expiresAt">, right: Pick<Lot, "expiresAt">) {
  if (!left.expiresAt || !right.expiresAt)
    return left.expiresAt ? -1 : right.expiresAt ? 1 : 0;
  return (
    new Date(left.expiresAt).getTime() - new Date(right.expiresAt).getTime()
  );
}

const detailGroup = { EXPIRING_SOON: 0, AVAILABLE: 1, EXPIRED: 2 } as const;

// Lotes del detalle desplegable. La API sólo devuelve lotes con unidades, así
// que los lotes históricos agotados nunca llegan acá (quedan en Inventario).
// Con un filtro de Vencimiento se ven sólo los lotes que lo cumplen.
// Orden: primero los próximos a vencer, después los normales y al final los
// vencidos; dentro de cada grupo, el que vence antes primero.
export function visibleProductLots<T extends Lot>(
  stock: T[],
  productId: string,
  expiry: string,
  lotQuery = "",
  now = new Date(),
) {
  return stock
    .filter(
      (lot) =>
        lot.productId === productId &&
        lot.quantity > 0 &&
        lotMatchesExpiry(lot, expiry, now) &&
        lotNumberMatches(lot.number, lotQuery),
    )
    .sort(byLotOrder);
}

// Orden de lotes acordado: primero los próximos a vencer, después los
// normales (los sin fecha al final) y por último los vencidos.
export function byLotOrder(
  left: Pick<Lot, "expiresAt" | "expiryStatus">,
  right: Pick<Lot, "expiresAt" | "expiryStatus">,
) {
  return (
    detailGroup[left.expiryStatus] - detailGroup[right.expiryStatus] ||
    byExpiry(left, right)
  );
}

const lotKey = (value: string) =>
  value.toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]/gu, "");

// Búsqueda por número de lote: ignora mayúsculas, espacios, guiones y barras,
// porque cada laboratorio lo imprime distinto ("L-2304", "l 2304").
export function lotNumberMatches(number: string, query: string) {
  const wanted = lotKey(query);
  return !wanted || lotKey(number).includes(wanted);
}

export type ProductStockStatus = {
  label: string;
  tone: "ok" | "warning" | "danger" | "muted";
  // Lotes vencidos que quedan detrás del lote principal ("1 lote vencido").
  expiredLots: number;
};

// Estado de la tabla: lo decide el primer lote según byLotOrder, igual que el
// detalle. Los vencidos sólo mandan cuando no queda otro lote; si hay otros,
// se cuentan aparte. Recibe sólo los lotes con unidades (ver productLots).
// Con el filtro Stock = Stock bajo (o su tarjeta) el estado dice Stock bajo,
// para que coincida con lo que se está filtrando.
export function productStockStatus(
  active: boolean,
  lots: Pick<Lot, "quantity" | "expiresAt" | "expiryStatus">[],
  sellable: number,
  stockFilter = "",
): ProductStockStatus {
  const first = [...lots].sort(byLotOrder)[0];
  const expired = lots.filter((lot) => lot.expiryStatus === "EXPIRED").length;
  const status = (
    label: string,
    tone: ProductStockStatus["tone"],
    expiredLots = expired,
  ) => ({ label, tone, expiredLots });
  if (!active) return status("Archivado", "muted", 0);
  if (!first) return status("Sin stock", "danger", 0);
  if (stockFilter === "low" && stockLevel(sellable) === "low")
    return status("Stock bajo", "warning");
  if (first.expiryStatus === "EXPIRED") return status("Vencido", "danger", 0);
  if (first.expiryStatus === "EXPIRING_SOON")
    return status("Por vencer", "warning");
  if (stockLevel(sellable) === "low") return status("Stock bajo", "warning");
  return status("Activo", "ok");
}

// Lote que define Próx. venc.: el primero según el orden acordado.
export function leadingLot<T extends Pick<Lot, "expiresAt" | "expiryStatus">>(
  lots: T[],
) {
  return [...lots].sort(byLotOrder)[0];
}
