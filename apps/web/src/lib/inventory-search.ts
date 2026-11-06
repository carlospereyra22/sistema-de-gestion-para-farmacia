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
export function inventorySupplierOption(supplier: {
  id: string;
  name: string;
  quantity?: number;
}): InventoryOption {
  return {
    value: supplier.id,
    label: supplier.name,
    detail:
      supplier.quantity === undefined
        ? ""
        : `${supplier.quantity} un. de este lote`,
    searchText: supplier.name,
  };
}
type LotSuppliers = Pick<StockLot, "suppliers" | "unassignedQuantity">;
// Valor de la opción "Sin proveedor" al devolver: la API lo recibe como null.
export const NO_SUPPLIER = "sin-proveedor";
export const noSupplierOption: InventoryOption = {
  value: NO_SUPPLIER,
  label: "Sin proveedor",
  detail: "",
  searchText: "Sin proveedor",
};
// Al devolver se elige entre los proveedores del lote que todavía tienen unidades.
// El stock sin proveedor sale sin proveedor o a uno que no figura en el lote.
export function inventoryReturnSuppliers(
  lot: LotSuppliers | undefined,
  all: InventoryOption[],
) {
  if (!lot) return all;
  const known = lot.suppliers ?? [];
  if (!known.length) return [noSupplierOption, ...all];
  const own = known
    .filter((supplier) => supplier.quantity > 0)
    .map(inventorySupplierOption);
  if (!lot.unassignedQuantity) return own;
  return [
    ...own,
    noSupplierOption,
    ...all.filter((option) => !known.some((item) => item.id === option.value)),
  ];
}
// Proveedor que queda elegido al tomar un lote; con varios decide el usuario.
export function inventoryDefaultReturnSupplier(lot: LotSuppliers | undefined) {
  if (!lot) return "";
  const available = (lot.suppliers ?? []).filter(
    (supplier) => supplier.quantity > 0,
  );
  if (!available.length) return NO_SUPPLIER;
  return available.length === 1 ? available[0]!.id : "";
}
type LotSupplier = NonNullable<StockLot["suppliers"]>[number];
// De quién es lo que el lote tiene hoy. Un proveedor en 0 trajo unidades que ya
// salieron: no forma parte del stock actual. supplier null es sin proveedor.
export function lotStockOrigins<S extends LotSupplier>(lot: {
  suppliers?: S[];
  unassignedQuantity?: number;
}) {
  const origins: {
    key: string;
    name: string;
    quantity: number;
    supplier: S | null;
  }[] = (lot.suppliers ?? [])
    .filter((supplier) => supplier.quantity > 0)
    .map((supplier) => ({
      key: supplier.id,
      name: supplier.name,
      quantity: supplier.quantity,
      supplier,
    }));
  if (lot.unassignedQuantity)
    origins.push({
      key: NO_SUPPLIER,
      name: "Sin proveedor",
      quantity: lot.unassignedQuantity,
      supplier: null,
    });
  return origins;
}
// Restar sale de quien tiene unidades en el lote. Sumar puede ser de cualquiera.
export function inventoryAdjustSuppliers(
  lot: LotSuppliers | undefined,
  all: InventoryOption[],
  direction: "subtract" | "add",
) {
  if (!lot) return [];
  if (direction === "add") return [noSupplierOption, ...all];
  return lotStockOrigins(lot).map((origin) =>
    origin.supplier
      ? inventorySupplierOption(origin.supplier)
      : {
          ...noSupplierOption,
          detail: `${origin.quantity} un. de este lote`,
        },
  );
}
// Proveedor que queda elegido al ajustar; con varios orígenes decide el usuario.
export function inventoryDefaultAdjustSupplier(lot: LotSuppliers | undefined) {
  if (!lot) return "";
  const origins = lotStockOrigins(lot);
  if (origins.length > 1) return "";
  return origins[0]?.supplier?.id ?? NO_SUPPLIER;
}
// Con más de un origen, cada uno va en su renglón para que los números sumen.
export function lotHasSupplierRows(lot: LotSuppliers) {
  return lotStockOrigins(lot).length > 1;
}
// Un lote sin proveedores conocidos no necesita aclaración.
export function lotSupplierSummary(lot: LotSuppliers) {
  if (!lot.suppliers?.length) return "";
  return lotStockOrigins(lot)
    .map((origin) => `${origin.name} · ${origin.quantity} un.`)
    .join(" / ");
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
