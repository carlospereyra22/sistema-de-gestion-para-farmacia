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
export function inventoryLotOption(
  lot: StockLot,
  product?: CatalogProduct,
): InventoryOption {
  const label = `${lot.productName} · Lote ${lot.number}`;
  const expiry = lot.expiresAt
    ? new Date(lot.expiresAt).toLocaleDateString("es-AR", { timeZone: "UTC" })
    : "sin fecha";
  const detail = [
    inventoryProductDetail(product),
    `${lot.quantity} un.`,
    `Vence ${expiry}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    value: lot.id,
    label,
    detail,
    searchText: `${label} ${detail} ${product ? inventoryProductOption(product).searchText : ""}`,
  };
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
