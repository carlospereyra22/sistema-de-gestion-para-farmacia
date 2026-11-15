import type { CatalogProduct } from "./api";
import { textoBuscable } from "./sale-catalog";

// Abrir cajas (SISTEMA-103): sugerencia de en qué producto se abre una caja.
// Es sólo una ayuda: el operador siempre confirma el producto y el número.

type Producto = Pick<
  CatalogProduct,
  "id" | "name" | "presentation" | "laboratory" | "active"
>;

/** Unidades del envase según su texto: "comp.rec.x 100" -> 100. */
export function presentationUnits(text: string | null | undefined) {
  const matches = [...(text ?? "").matchAll(/x\s*(\d{1,4})\b/gi)];
  const units = Number(matches.at(-1)?.[1]);
  return Number.isInteger(units) && units > 0 ? units : null;
}

const unidades = (p: Producto) =>
  presentationUnits(p.presentation) ?? presentationUnits(p.name);

/** "BUSCAPINA DUO comp.rec. x 100" -> "buscapina duo". */
export function splitBaseName(name: string) {
  const texto = textoBuscable(name).replace(/\s+/g, " ").trim();
  const corte = texto.search(
    /\s(x\s*\d|\d|comp|bl[ií]ster|bls|caps|tab|grag|sobre|amp|fco|frasco|susp|jbe)/,
  );
  return (corte > 0 ? texto.slice(0, corte) : texto).trim();
}

/**
 * Presentaciones más chicas del mismo producto (mismo nombre base y, si los
 * dos lo tienen, mismo laboratorio), con el número sugerido cuando las
 * unidades de las dos presentaciones lo permiten (100 / 10 = 10).
 */
export function suggestSplitTargets<T extends Producto>(
  caja: Producto,
  productos: readonly T[],
) {
  const base = splitBaseName(caja.name);
  const total = unidades(caja);
  return productos
    .filter(
      (p) =>
        p.id !== caja.id &&
        p.active &&
        splitBaseName(p.name) === base &&
        (!caja.laboratory ||
          !p.laboratory ||
          caja.laboratory.id === p.laboratory.id),
    )
    .map((product) => {
      const parte = unidades(product);
      const factor =
        total && parte && parte < total && total % parte === 0
          ? total / parte
          : null;
      return { product, factor };
    })
    .filter(({ product, factor }) => factor !== null || !unidades(product))
    .sort((a, b) => (b.factor ?? 0) - (a.factor ?? 0));
}
