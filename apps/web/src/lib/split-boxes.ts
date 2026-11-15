import type { CatalogProduct, StockLot } from "./api";
import { suggestSplitTargets } from "./split-link";

// Abrir cajas (SISTEMA-103): vista previa. El servidor revalida todo.

/** Lotes de la caja que se pueden abrir: con stock vendible (no vencido). */
export function splittableLots(stock: readonly StockLot[], productId: string) {
  return stock.filter(
    (lot) => lot.productId === productId && lot.sellableQuantity > 0,
  );
}

/** El producto se abre en otro y ese otro está en el catálogo. */
export function splitTarget(
  product: Pick<CatalogProduct, "splitTargetProductId" | "splitFactor">,
  products: readonly CatalogProduct[],
) {
  if (!product.splitTargetProductId || !product.splitFactor) return null;
  const target = products.find((p) => p.id === product.splitTargetProductId);
  return target ? { target, factor: product.splitFactor } : null;
}

// Fecha civil: mes/año sin pasar por la zona horaria.
const fecha = (iso: string | null) =>
  iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "sin vencimiento";

/** "2 cajas de X (lote L1, vence 05/2027) → +20 Y, mismo lote." */
export function splitSummary(
  boxName: string,
  targetName: string,
  lot: Pick<StockLot, "number" | "expiresAt">,
  boxes: number,
  factor: number,
) {
  const cajas = boxes === 1 ? "1 caja" : `${boxes} cajas`;
  const vence = lot.expiresAt ? `vence ${fecha(lot.expiresAt)}` : fecha(null);
  return `${cajas} de ${boxName} (lote ${lot.number}, ${vence}) → +${boxes * factor} ${targetName}, mismo lote y vencimiento.`;
}

/** "BUSCAPINA DUO · blíster comp.rec.x 10": el nombre solo no distingue. */
export function productLabel(p: Pick<CatalogProduct, "name" | "presentation">) {
  return [p.name, p.presentation].filter(Boolean).join(" · ");
}

/**
 * En qué se puede abrir una caja: primero el vínculo del producto y después
 * las otras presentaciones del mismo producto (mismo nombre base y
 * laboratorio, ej. Buscapina Duo x20; nunca Buscapina Perlas).
 */
export function splitTargetOptions(
  product: CatalogProduct,
  products: readonly CatalogProduct[],
) {
  const options = new Map<
    string,
    { id: string; label: string; factor: number | null }
  >();
  const link = splitTarget(product, products);
  if (link)
    options.set(link.target.id, {
      id: link.target.id,
      label: productLabel(link.target),
      factor: link.factor,
    });
  for (const { product: p, factor } of suggestSplitTargets(product, products))
    if (!options.has(p.id))
      options.set(p.id, { id: p.id, label: productLabel(p), factor });
  return [...options.values()];
}
