import { validateAllocations, readAllocations } from "./item-allocations";
describe("Item allocations", () => {
  it("accepts partial payment of selected articles", () => {
    expect(() =>
      validateAllocations(
        [{ saleItemId: "a", amountMinor: 200 }],
        200,
        new Map([
          ["a", 500n],
          ["b", 800n],
        ]),
      ),
    ).not.toThrow();
  });
  it("rejects duplicated, foreign and overpaid items", () => {
    expect(() =>
      validateAllocations(
        [
          { saleItemId: "a", amountMinor: 200 },
          { saleItemId: "a", amountMinor: 200 },
        ],
        400,
        new Map([["a", 500n]]),
      ),
    ).toThrow();
    expect(() =>
      validateAllocations(
        [{ saleItemId: "b", amountMinor: 200 }],
        200,
        new Map([["a", 500n]]),
      ),
    ).toThrow();
    expect(() =>
      validateAllocations(
        [{ saleItemId: "a", amountMinor: 600 }],
        600,
        new Map([["a", 500n]]),
      ),
    ).toThrow();
  });
  it("rejects invalid amounts and totals", () => {
    for (const amountMinor of [0, -1, 1.5, NaN])
      expect(() =>
        validateAllocations(
          [{ saleItemId: "a", amountMinor }],
          10,
          new Map([["a", 500n]]),
        ),
      ).toThrow();
    expect(() =>
      validateAllocations(
        [{ saleItemId: "a", amountMinor: 200 }],
        100,
        new Map([["a", 500n]]),
      ),
    ).toThrow();
  });
  it("does not invent allocations for historic receipts", () => {
    expect(readAllocations(null)).toEqual([]);
  });
});
