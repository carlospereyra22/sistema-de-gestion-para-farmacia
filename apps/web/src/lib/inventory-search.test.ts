import { describe, expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  filterInventoryOptions,
  findScannedProduct,
  inventoryEnterOption,
  inventoryLotChoice,
  inventoryProductDetail,
  inventoryProductOption,
  scanAutoDelay,
} from "./inventory-search";
function product(id: string, laboratory: string, code: string): CatalogProduct {
  return {
    id,
    name: "Loratadina",
    laboratory: { id: laboratory, name: laboratory },
    activeIngredient: "Loratadina",
    concentration: "10 mg",
    presentation: "10 comprimidos",
    saleUnit: "BOX",
    barcodes: [{ code }],
    active: true,
  } as CatalogProduct;
}
const a = product("a", "Laboratorio Álvarez", "779000000001");
const b = product("b", "Laboratorio Beta", "779000000002");
const options = [a, b].map(inventoryProductOption);
it("distinguishes the same medicine by laboratory, without merging product IDs", () => {
  expect(filterInventoryOptions(options, "loratadina")).toHaveLength(2);
  expect(filterInventoryOptions(options, "ALVAREZ lora")).toEqual([options[0]]);
  expect(filterInventoryOptions(options, "beta 10 comprimidos")).toEqual([
    options[1],
  ]);
  expect(inventoryProductDetail(a)).toContain("Laboratorio Álvarez");
  expect(inventoryProductDetail(b)).toContain("Laboratorio Beta");
});
it("searches all barcodes and pharmaceutical details, ignoring accents and word order", () => {
  const item = inventoryProductOption({
    ...a,
    name: "Marca",
    activeIngredient: "Cetirizina",
    pharmaceuticalForm: "Solución",
    barcodes: [{ code: "primary" }, { code: "SG123456789012" }],
  });
  expect(filterInventoryOptions([item], "solucion CETIRI")).toEqual([item]);
  expect(filterInventoryOptions([item], "SG123456789012")).toEqual([item]);
  expect(filterInventoryOptions(options, "779000000002")).toEqual([options[1]]);
  expect(filterInventoryOptions(options, "nada")).toEqual([]);
  expect(filterInventoryOptions(options, "   ")).toEqual(options);
});
it("distingue los lotes de un producto por número, unidades y vencimiento", () => {
  const lot = {
    id: "lot-a",
    productId: a.id,
    productName: a.name,
    number: "ABC123",
    quantity: 4,
    expiresAt: "2026-01-01",
    unitCostMinor: "100",
    metadataVersion: 0,
    sellableQuantity: 0,
    expiredQuantity: 4,
    expiryStatus: "EXPIRED",
  } satisfies StockLot;
  const result = inventoryLotChoice(lot);
  const other = inventoryLotChoice({ ...lot, id: "lot-b", number: "XYZ" });
  expect(filterInventoryOptions([result, other], "abc123")).toEqual([result]);
  expect(result.label).toBe("Lote ABC123");
  expect(result.detail).toBe("4 un. · Vence 1/1/2026 · Vencido");
  expect(
    inventoryLotChoice({ ...lot, expiresAt: null, expiryStatus: "AVAILABLE" })
      .detail,
  ).toBe("4 un. · Sin vencimiento");
});
it("does not guess a laboratory or lot on Enter when matches are ambiguous", () => {
  expect(inventoryEnterOption(options, -1)).toBeUndefined();
  expect(inventoryEnterOption(options, 1)).toEqual(options[1]);
  expect(inventoryEnterOption([options[0]!], -1)).toEqual(options[0]);
  expect(inventoryEnterOption([], -1)).toBeUndefined();
});
it("shows missing laboratory explicitly without inventing product data", () => {
  expect(inventoryProductDetail({ ...a, laboratory: null })).toContain(
    "Sin laboratorio",
  );
  expect(inventoryProductDetail()).toBe("");
});

describe("escáner sin Enter", () => {
  const products = [
    { id: "corto", barcodes: [{ code: "12345678" }] },
    { id: "largo", barcodes: [{ code: "7896902211124" }] },
  ];

  it("encuentra el código exacto, dentro de un QR y como GTIN de 14 dígitos", () => {
    expect(findScannedProduct(products, " 7896902211124 ")?.id).toBe("largo");
    expect(
      findScannedProduct(products, "https://x.ar/01/7896902211124")?.id,
    ).toBe("largo");
    expect(findScannedProduct(products, "07896902211124")?.id).toBe("largo");
    expect(findScannedProduct(products, "789690")).toBeUndefined();
  });

  it("procesa rápido lo encontrado y espera más para avisar que no existe", () => {
    expect(scanAutoDelay(true, "12345678")).toBe(250);
    expect(scanAutoDelay(false, "99999999")).toBe(1000);
  });

  it("no hace nada mientras el texto es corto o está vacío", () => {
    expect(scanAutoDelay(false, "1234567")).toBeNull();
    expect(scanAutoDelay(false, "   ")).toBeNull();
  });
});
