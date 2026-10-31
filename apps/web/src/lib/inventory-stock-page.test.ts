import { expect, it } from "vitest";
import type { StockLot } from "./api";
import { inventoryLotOption } from "./inventory-search";
import { inventoryStockPage } from "./inventory-stock-page";

const stock: StockLot[] = Array.from({ length: 23 }, (_, index) => ({
  id: `lot-${index}`,
  productId: "same-product",
  productName: "Loratadina",
  number: `LOTE-${index}`,
  quantity: 5,
  sellableQuantity: 5,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  expiresAt: null,
  unitCostMinor: "100",
  metadataVersion: 0,
}));
const options = stock.map((lot) => inventoryLotOption(lot));

it("shows ten lots per page in original order without merging lots of the same product", () => {
  const first = inventoryStockPage(stock, options, "", 1);
  expect(first).toMatchObject({ total: 23, totalPages: 3, currentPage: 1 });
  expect(first.lots).toEqual(stock.slice(0, 10));
  expect(inventoryStockPage(stock, options, "", 2).lots).toEqual(
    stock.slice(10, 20),
  );
  expect(inventoryStockPage(stock, options, "", 3).lots).toEqual(
    stock.slice(20),
  );
  expect(stock).toHaveLength(23);
});
it("searches across all pages before slicing and clamps pages after filtering", () => {
  const result = inventoryStockPage(stock, options, "LOTE-22", 3);
  expect(result).toEqual({
    total: 1,
    totalPages: 1,
    currentPage: 1,
    lots: [stock[22]],
  });
});
it("keeps a valid page when lots disappear after a refresh", () => {
  const remaining = stock.slice(0, 12);
  expect(inventoryStockPage(remaining, options, "", 3)).toEqual({
    total: 12,
    totalPages: 2,
    currentPage: 2,
    lots: remaining.slice(10),
  });
});
it("returns an empty first page for no matches or empty stock", () => {
  const empty = { total: 0, totalPages: 1, currentPage: 1, lots: [] };
  expect(inventoryStockPage(stock, options, "missing", 2)).toEqual(empty);
  expect(inventoryStockPage([], [], "", 1)).toEqual(empty);
});
