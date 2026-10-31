import { describe, expect, it } from "vitest";
import {
  preparePurchaseLines,
  prepareReceiptLines,
  purchasePending,
  purchaseStatus,
} from "./purchases";

const item = {
  id: "item",
  productId: "product",
  orderedQuantity: 200,
  receivedQuantity: 100,
  cancelledQuantity: 0,
  unitCostMinor: "70000",
};
const row = (quantity: string, lotNumber = "A") => ({
  key: lotNumber,
  itemId: "item",
  quantity,
  lotNumber,
  expiresAt: "",
});
describe("purchase editor validation", () => {
  it("accepts 50 products and converts costs to minor units", () => {
    const lines = preparePurchaseLines(
      Array.from({ length: 50 }, (_, i) => ({
        productId: String(i),
        quantity: "200",
        cost: "700.25",
      })),
    );
    expect(lines).toHaveLength(50);
    expect(lines[0]).toEqual({
      productId: "0",
      quantity: 200,
      unitCostMinor: 70025,
    });
  });
  it("rejects repeated products, empty costs, fractional and negative quantities", () => {
    const line = { productId: "p", quantity: "1", cost: "1" };
    expect(() => preparePurchaseLines([line, line])).toThrow();
    for (const quantity of ["", "-1", "1.5", "Infinity"])
      expect(() => preparePurchaseLines([{ ...line, quantity }])).toThrow();
    expect(() => preparePurchaseLines([{ ...line, cost: "" }])).toThrow();
  });
  it("receives several lots with one aggregate limit and ignores unreceived lines", () => {
    expect(
      prepareReceiptLines([row("60"), row("40", "B"), row("")], [item]),
    ).toHaveLength(2);
    expect(() =>
      prepareReceiptLines([row("60"), row("41", "B")], [item]),
    ).toThrow();
    expect(() => prepareReceiptLines([row("1", "")], [item])).toThrow();
    expect(() => prepareReceiptLines([row("")], [item])).toThrow();
  });
  it("deducts closed balance without changing received quantities and translates statuses", () => {
    expect(purchasePending({ ...item, cancelledQuantity: 100 })).toBe(0);
    expect(
      purchaseStatus({ status: "CANCELLED", closedAt: "2026-10-19" }),
    ).toBe("Saldo cerrado");
    expect(purchaseStatus({ status: "PARTIALLY_RECEIVED" })).toBe(
      "Recibida parcialmente",
    );
  });
});
