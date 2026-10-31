import { expect, it } from "vitest";
import { sortSaleLines } from "./sort-sale-lines";

it("orders the cart by Spanish product names regardless of insertion order or case", () => {
  const products = [
    { id: "c", name: "Cefalexina 500x10" },
    { id: "a", name: "actron 400" },
    { id: "b", name: "Ácido fólico" },
  ];
  expect(
    sortSaleLines(
      [{ productId: "c" }, { productId: "a" }, { productId: "b" }],
      products,
    ).map((line) => line.productId),
  ).toEqual(["b", "a", "c"]);
});
it("orders numbers naturally without mutating lines, quantities or discounts", () => {
  const lines = [
    { productId: "large", quantity: 3, discountMinor: 50 },
    { productId: "small", quantity: 1, discountMinor: 0 },
  ];
  const sorted = sortSaleLines(lines, [
    { id: "large", name: "Producto x20" },
    { id: "small", name: "Producto x2" },
  ]);
  expect(sorted).toEqual([lines[1], lines[0]]);
  expect(sorted[1]).toBe(lines[0]);
  expect(lines[0]?.productId).toBe("large");
  expect(sortSaleLines([], [])).toEqual([]);
});
