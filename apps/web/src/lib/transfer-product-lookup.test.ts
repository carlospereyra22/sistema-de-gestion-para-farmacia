import { describe, expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  findTransferProductsByBarcode,
  singleAvailableTransferLotId,
} from "./transfer-product-lookup";

const products = [
  { id: "a", barcodes: [{ code: "7791234567895" }, { code: "SG123" }] },
  { id: "b", barcodes: [{ code: "7791234567895" }] },
  { id: "c", barcodes: [{ code: "7799876543210" }] },
] as CatalogProduct[];
const stock = [
  { productId: "a", quantity: 3 },
  { productId: "b", quantity: 2 },
  { productId: "c", quantity: 0 },
] as StockLot[];

describe("findTransferProductsByBarcode", () => {
  it("busca códigos exactos y conserva todas las coincidencias con stock", () => {
    expect(
      findTransferProductsByBarcode(products, stock, " 7791234567895 ").map(
        (p) => p.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      findTransferProductsByBarcode(products, stock, "sg123").map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("no propone productos sin stock ni coincidencias parciales", () => {
    expect(
      findTransferProductsByBarcode(products, stock, "7799876543210"),
    ).toEqual([]);
    expect(findTransferProductsByBarcode(products, stock, "7791234")).toEqual(
      [],
    );
  });
});

describe("singleAvailableTransferLotId", () => {
  const lots = [
    { id: "a-1", productId: "a", quantity: 26 },
    { id: "a-empty", productId: "a", quantity: 0 },
    { id: "b-1", productId: "b", quantity: 5 },
    { id: "b-2", productId: "b", quantity: 8 },
  ] as StockLot[];

  it("elige el único lote con unidades disponibles", () => {
    expect(singleAvailableTransferLotId(lots, "a")).toBe("a-1");
  });

  it("deja elegir cuando hay varios lotes o ninguno", () => {
    expect(singleAvailableTransferLotId(lots, "b")).toBe("");
    expect(singleAvailableTransferLotId(lots, "c")).toBe("");
  });
});
