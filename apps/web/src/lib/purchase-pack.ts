import type { CatalogProduct } from "./api";
import { externalGtin } from "./external-product";
import type { ImportRow } from "./purchase-excel";

// Exhibidor de droguería: un código que equivale a N unidades de otro. Se
// recibe como N unidades del producto base, con el costo dividido por N.
export type PurchasePack = {
  barcode: string;
  baseBarcode: string;
  factor: number;
};

// 'SERTAL COMPUESTO VL COM.RE X10 EXHIB. X20' -> 20
export function invoicePackFactor(name: string): number | null {
  const factor = Number(/\bEXHIB\.?\s*X\s*(\d{1,4})\b/i.exec(name)?.[1]);
  return factor >= 2 && factor <= 1000 ? factor : null;
}

// Las dos primeras palabras: la droguería abrevia el resto.
export function packSearchText(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).join(" ");
}

const codeKey = (code: string) => externalGtin(code) ?? code;

// Unidades por exhibidor de un producto, si alguno de sus códigos es envase base.
export function productPackFactor(
  product: Pick<CatalogProduct, "barcodes">,
  packs: PurchasePack[],
): number | null {
  const codes = new Set(
    product.barcodes.map((item) => codeKey(item.code.trim())),
  );
  const factors = packs
    .filter((pack) => codes.has(codeKey(pack.baseBarcode)))
    .map((pack) => pack.factor);
  return factors.length ? Math.max(...factors) : null;
}

// Vender un exhibidor es vender N unidades del producto base.
export function packSaleProduct<T extends Pick<CatalogProduct, "barcodes">>(
  code: string,
  products: T[],
  packs: PurchasePack[],
) {
  const key = codeKey(code.trim());
  const pack = packs.find((item) => codeKey(item.barcode) === key);
  if (!pack) return null;
  const baseKey = codeKey(pack.baseBarcode);
  const product = products.find((item) =>
    item.barcodes.some((barcode) => codeKey(barcode.code.trim()) === baseKey),
  );
  return product ? { product, factor: pack.factor } : null;
}

// Exhibidores enteros, lote por lote: un exhibidor es de un solo lote, así que
// 19 de uno y 3 de otro no arman uno aunque sumen más de 20.
export function intactPacks(
  lots: { sellableQuantity: number }[],
  factor: number,
) {
  return lots.reduce(
    (total, lot) => total + Math.floor(lot.sellableQuantity / factor),
    0,
  );
}

export function applyPacks(
  rows: ImportRow[],
  packs: PurchasePack[],
  products: CatalogProduct[],
): ImportRow[] {
  const byCode = new Map(packs.map((pack) => [codeKey(pack.barcode), pack]));
  return rows.map((row) => {
    const pack = byCode.get(codeKey(row.code));
    if (!pack) return row;
    const baseKey = codeKey(pack.baseBarcode);
    const owners = products.filter(
      (product) =>
        product.active &&
        (!product.branchStatus || product.branchStatus === "ACTIVE") &&
        product.barcodes.some((item) => codeKey(item.code.trim()) === baseKey),
    );
    const product = owners.length === 1 ? owners[0] : undefined;
    return {
      ...row,
      code: pack.baseBarcode,
      quantity: row.quantity ? String(Number(row.quantity) * pack.factor) : "",
      cost: row.cost ? (Number(row.cost) / pack.factor).toFixed(2) : "",
      productId: product?.id ?? null,
      matchedBy: product ? "code" : null,
      issue: !row.quantity
        ? row.issue
        : owners.length > 1
          ? "Coincidencia ambigua"
          : product
            ? null
            : "Elegí un producto",
      pack: { code: row.code, factor: pack.factor },
    };
  });
}
