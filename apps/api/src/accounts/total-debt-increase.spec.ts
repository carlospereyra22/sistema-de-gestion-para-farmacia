import {
  distributeDebtIncrease,
  type TotalDebtInput,
} from "./total-debt-increase";
const input: TotalDebtInput = {
  expectedPendingMinor: 300,
  nextPendingMinor: 301,
  expectedItems: [
    { saleItemId: "b", pendingMinor: "200" },
    { saleItemId: "a", pendingMinor: "100" },
  ],
  reason: "Aumento general",
  clientOperationId: "operation",
};
describe("manual total debt allocation", () => {
  it("distributes exact cents proportionally and deterministically", () => {
    const result = distributeDebtIncrease(input);
    expect(result.map((item) => item.amountMinor)).toEqual(["0", "1"]);
    expect(
      distributeDebtIncrease({
        ...input,
        expectedItems: [...input.expectedItems].reverse(),
      }),
    ).toEqual(result);
    expect(
      distributeDebtIncrease({ ...input, nextPendingMinor: 450 }).map(
        (item) => item.amountMinor,
      ),
    ).toEqual(["50", "100"]);
    expect(result.every((item) => item.unitPriceMinor === "0")).toBe(true);
  });
  it("rejects decreases, unsafe totals, incomplete and duplicate snapshots", () => {
    expect(() =>
      distributeDebtIncrease({ ...input, nextPendingMinor: 300 }),
    ).toThrow();
    expect(() =>
      distributeDebtIncrease({
        ...input,
        nextPendingMinor: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
    expect(() =>
      distributeDebtIncrease({
        ...input,
        expectedItems: [input.expectedItems[0]!],
      }),
    ).toThrow();
    expect(() =>
      distributeDebtIncrease({
        ...input,
        expectedItems: [input.expectedItems[0]!, input.expectedItems[0]!],
      }),
    ).toThrow();
    expect(() =>
      distributeDebtIncrease({
        ...input,
        expectedItems: [{ saleItemId: "a", pendingMinor: "-300" }],
      }),
    ).toThrow();
  });
});
