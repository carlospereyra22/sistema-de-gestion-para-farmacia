import type { CatalogProduct, StockLot } from "./api";

export type InventoryOption = {
  value: string;
  label: string;
  detail: string;
  searchText: string;
};
export function inventoryProductDetail(product?: CatalogProduct) {
  if (!product) return "";
  return [
    product.laboratory?.name ?? "Sin laboratorio",
    product.concentration,
    product.presentation,
    { BOX: "Caja", BLISTER: "Blíster", UNIT: "Unidad" }[product.saleUnit],
  ]
    .filter(Boolean)
    .join(" · ");
}
export function inventoryProductOption(
  product: CatalogProduct,
): InventoryOption {
  const detail = inventoryProductDetail(product);
  const codes = product.barcodes.map((barcode) => barcode.code).join(" ");
  return {
    value: product.id,
    label: product.name,
    detail,
    searchText: [
      product.name,
      detail,
      product.activeIngredient,
      product.pharmaceuticalForm,
      codes,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
export function inventoryLotDetail(
  lot: Pick<StockLot, "quantity" | "expiresAt" | "expiryStatus">,
) {
  return [
    `${lot.quantity} un.`,
    lot.expiresAt
      ? `Vence ${new Date(lot.expiresAt).toLocaleDateString("es-AR", { timeZone: "UTC" })}`
      : "Sin vencimiento",
    lot.expiryStatus === "EXPIRED" ? "Vencido" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
// Opción de un lote cuando el producto ya está elegido: lo que distingue es el
// número, las unidades y el vencimiento.
export function inventoryLotChoice(lot: StockLot): InventoryOption {
  const label = `Lote ${lot.number}`;
  const detail = inventoryLotDetail(lot);
  return { value: lot.id, label, detail, searchText: `${label} ${detail}` };
}
// Un QR puede traer el código dentro de otro texto, y un GTIN de 14 dígitos
// que empieza con 0 equivale al EAN de 13.
export function findScannedProduct<T extends { barcodes: { code: string }[] }>(
  products: T[],
  rawCode: string,
) {
  const code = rawCode.trim();
  const candidates = new Set(
    [code, ...(code.match(/\d{8,14}/g) ?? [])].flatMap((item) =>
      item.length === 14 && item.startsWith("0")
        ? [item, item.slice(1)]
        : [item],
    ),
  );
  return products.find((product) =>
    product.barcodes.some((barcode) => candidates.has(barcode.code.trim())),
  );
}

const SCAN_FOUND_DELAY_MS = 250;
const SCAN_MISSING_DELAY_MS = 1000;
const SCAN_MIN_LENGTH = 8;

// Espera antes de procesar un código sin Enter, o null si todavía no hay que
// procesarlo. El lector escribe mucho más rápido que esta pausa: si llega otro
// carácter se vuelve a contar, así que un código que empieza como otro más
// corto no elige el producto equivocado. El aviso de "no encontrado" espera
// más para no aparecer mientras alguien escribe a mano.
export function scanAutoDelay(found: boolean, rawCode: string) {
  if (found) return SCAN_FOUND_DELAY_MS;
  return rawCode.trim().length >= SCAN_MIN_LENGTH
    ? SCAN_MISSING_DELAY_MS
    : null;
}

export function filterInventoryOptions(
  options: InventoryOption[],
  query: string,
) {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR");
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = normalize(option.searchText);
    return words.every((word) => text.includes(word));
  });
}

export function inventoryEnterOption(
  results: InventoryOption[],
  active: number,
) {
  // Homonymous medicines/lots require an explicit choice, never pick the first silently.
  return active >= 0
    ? results[active]
    : results.length === 1
      ? results[0]
      : undefined;
}
