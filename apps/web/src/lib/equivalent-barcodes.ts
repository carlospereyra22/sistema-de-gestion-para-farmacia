import type { CatalogProduct, ProductBarcodeKind } from "./api";
import { externalGtin } from "./external-product";

type ProductCodes = Pick<CatalogProduct, "barcodes">;

// Códigos de envases importados asociados al producto (SISTEMA-20).
export function equivalentBarcodes(product: ProductCodes): string[] {
  return product.barcodes
    .filter((barcode) => barcode.kind === "EQUIVALENT")
    .map((barcode) => barcode.code);
}

export function primaryBarcodeOf(product: ProductCodes): string | undefined {
  return product.barcodes.find(
    (barcode) => barcode.primary === true || barcode.primary === undefined,
  )?.code;
}

// Tipo del código del producto que coincide con `code` (con o sin ceros).
export function barcodeKindOf(
  product: ProductCodes,
  code: string,
): ProductBarcodeKind | undefined {
  const gtin = externalGtin(code.trim());
  const match = product.barcodes.find((barcode) =>
    gtin ? externalGtin(barcode.code) === gtin : barcode.code === code.trim(),
  );
  return match ? (match.kind ?? "PACKAGE") : undefined;
}

// Producto del catálogo que ya tiene este código, con o sin ceros a la
// izquierda. Sirve para no crear un duplicado del medicamento nacional.
export function findProductByBarcode<T extends ProductCodes>(
  products: readonly T[],
  code: string,
): T | undefined {
  const gtin = externalGtin(code.trim());
  if (!gtin) return undefined;
  return products.find((product) =>
    product.barcodes.some((barcode) => externalGtin(barcode.code) === gtin),
  );
}
