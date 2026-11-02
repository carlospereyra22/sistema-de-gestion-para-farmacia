import { describe, expect, it } from "vitest";
import { percentToDiscountMinor } from "./sale-discount-percent";

describe("general discount in percent", () => {
  it("converts whole percentages to cents", () => {
    expect(percentToDiscountMinor("10", 1_707_000)).toBe(170_700);
  });
  it("accepts a decimal comma", () => {
    expect(percentToDiscountMinor("12,5", 1_000_000)).toBe(125_000);
  });
  it("rounds to the nearest cent", () => {
    expect(percentToDiscountMinor("33,33", 1_001)).toBe(334);
  });
  it("treats an empty draft as no discount", () => {
    expect(percentToDiscountMinor("", 1_000_000)).toBe(0);
  });
  it("allows the full subtotal", () => {
    expect(percentToDiscountMinor("100", 238_000)).toBe(238_000);
  });
  it.each(["100,01", "-5", "abc", "10%"])("rejects %s", (value) => {
    expect(percentToDiscountMinor(value, 1_000_000)).toBeUndefined();
  });
  it("rejects an invalid subtotal", () => {
    expect(percentToDiscountMinor("10", -1)).toBeUndefined();
  });
});
