import { expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  filterInventoryOptions,
  inventoryEnterOption,
  inventoryLotOption,
  inventoryProductDetail,
  inventoryProductOption,
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
it("keeps distinct lots and supports product/laboratory/lot search with physical stock unchanged", () => {
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
  const result = inventoryLotOption(lot, a);
  const other = inventoryLotOption({ ...lot, id: "lot-b", number: "XYZ" }, a);
  expect(filterInventoryOptions([result, other], "alvarez abc123")).toEqual([
    result,
  ]);
  expect(result.detail).toContain("4 un.");
  expect(lot.quantity).toBe(4);
  expect(inventoryLotOption(lot).label).toContain("Loratadina");
  expect(inventoryLotOption(lot).searchText).toContain("ABC123");
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
