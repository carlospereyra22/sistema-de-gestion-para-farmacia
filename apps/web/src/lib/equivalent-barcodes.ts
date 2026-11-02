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

function searchKey(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");
}

// Productos del catálogo cuyo nombre o presentación contiene todas las
// palabras buscadas. Con `onlyMedicines`, sólo medicamentos (candidatos para
// asociar un envase importado).
export function medicinesByName<
  T extends ProductCodes &
    Pick<CatalogProduct, "id" | "name" | "presentation" | "isMedication">,
>(products: readonly T[], query: string, limit = 5, onlyMedicines = true): T[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (!words.length || searchKey(query).trim().length < 2) return [];
  const seen = new Set<string>();
  return products
    .filter((product) => {
      if (seen.has(product.id) || (onlyMedicines && !product.isMedication))
        return false;
      seen.add(product.id);
      const text = searchKey(`${product.name} ${product.presentation ?? ""}`);
      return words.every((word) => text.includes(word));
    })
    .slice(0, limit);
}

// Producto del catálogo que ya tiene este código, con o sin ceros a la
// izquierda. Sirve para no crear un duplicado del medicamento nacional. Los
// códigos que no son GTIN público (uso interno, prefijo 2) se comparan exactos.
export function findProductByBarcode<T extends ProductCodes>(
  products: readonly T[],
  code: string,
): T | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  const gtin = externalGtin(trimmed);
  return products.find((product) =>
    product.barcodes.some((barcode) =>
      gtin ? externalGtin(barcode.code) === gtin : barcode.code === trimmed,
    ),
  );
}
