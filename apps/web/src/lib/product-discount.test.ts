import { describe, it, expect } from "vitest";
import { discountedUnitPrice, productDiscountDraft } from "./product-discount";
describe("product discount as a unit price", () => {
  it("calculates percentages from the original price in exact cents", () => {
    expect(discountedUnitPrice(405500, "10", "percent")).toBe(364950);
    expect(discountedUnitPrice(101, "50", "percent")).toBe(51);
    expect(discountedUnitPrice(405500, "100", "percent")).toBe(0);
  });
  it("subtracts pesos per unit and clears to the original price", () => {
    expect(discountedUnitPrice(405500, "500", "amount")).toBe(355500);
    expect(discountedUnitPrice(405500, "", "amount")).toBe(405500);
    expect(discountedUnitPrice(405500, "0", "percent")).toBe(405500);
  });
  it("rejects negative, excessive and malformed values", () => {
    for (const text of ["-1", "101", "abc"])
      expect(discountedUnitPrice(100, text, "percent")).toBeUndefined();
    expect(discountedUnitPrice(100, "1,01", "amount")).toBeUndefined();
  });
  it("reflects manual price changes without applying another discount", () => {
    expect(productDiscountDraft(405500, 364950, "percent")).toBe("10");
    expect(productDiscountDraft(405500, 355500, "amount")).toBe("500");
    expect(productDiscountDraft(0, 0, "percent")).toBe("");
  });
});
