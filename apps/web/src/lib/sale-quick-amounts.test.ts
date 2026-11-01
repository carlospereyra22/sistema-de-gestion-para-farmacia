import { describe, expect, it } from "vitest";
import { changeMinor, quickCashAmounts } from "./sale-quick-amounts";

describe("quick cash amounts", () => {
  it("offers the exact amount and the next useful roundings", () => {
    expect(quickCashAmounts(1_707_000)).toEqual([
      1_707_000, 1_800_000, 2_000_000, 5_000_000,
    ]);
  });
  it("does not repeat the exact amount when it is already round", () => {
    expect(quickCashAmounts(2_000_000)).toEqual([2_000_000, 5_000_000]);
  });
  it("keeps cents in the exact amount", () => {
    expect(quickCashAmounts(238_050)).toEqual([
      238_050, 300_000, 500_000, 1_000_000,
    ]);
  });
  it("returns at most four amounts", () => {
    expect(quickCashAmounts(12_345).length).toBeLessThanOrEqual(4);
  });
  it.each([0, -100, 1.5, Number.NaN])("returns nothing for %s", (value) => {
    expect(quickCashAmounts(value)).toEqual([]);
  });
});

describe("change", () => {
  it("returns what exceeds the due amount", () => {
    expect(changeMinor(2_000_000, 1_707_000)).toBe(293_000);
  });
  it("never returns negative change", () => {
    expect(changeMinor(1_000_000, 1_707_000)).toBe(0);
  });
});
