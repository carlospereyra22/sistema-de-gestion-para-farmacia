import { priceAdjustments, priceIncrease } from "./price-adjustment";

it("reads manual increases without changing the reference-price baseline", () => {
  expect(
    priceAdjustments({
      kind: "MANUAL_DEBT_ADJUSTMENT",
      items: [{ saleItemId: "item", amountMinor: "2000", unitPriceMinor: "0" }],
    }),
  ).toEqual([{ saleItemId: "item", amountMinor: 2000n, unitPriceMinor: 0n }]);
  expect(priceIncrease(12000n, 10000n, 11000n)).toBe(1200n);
});
it("keeps reference adjustments and legacy allocations distinct", () => {
  expect(priceAdjustments([{ saleItemId: "item", amountMinor: 2000 }])).toEqual(
    [],
  );
  expect(
    priceAdjustments({
      kind: "PRICE_ADJUSTMENT",
      items: [
        { saleItemId: "item", amountMinor: "2000", unitPriceMinor: "12000" },
      ],
    })[0]?.unitPriceMinor,
  ).toBe(12000n);
});
