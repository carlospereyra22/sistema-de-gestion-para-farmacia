import { expect, it } from "vitest";
import { accountCollectionAllocations } from "./account-collection-allocation";
const items = [{ saleItemId: "a", pendingMinor: "900000" }];
it("editing payment alone remains partial and does not adjust debt", () => {
  expect(accountCollectionAllocations(items, { a: "2000" }, {}, false)).toEqual(
    [{ saleItemId: "a", amountMinor: 200000 }],
  );
});
it("keeps the confirmed balance and amount collected independent", () => {
  expect(
    accountCollectionAllocations(items, { a: "2000" }, { a: "8000" }, false),
  ).toEqual([
    {
      saleItemId: "a",
      amountMinor: 200000,
      expectedPendingMinor: 900000,
      nextPendingMinor: 800000,
    },
  ]);
  expect(
    accountCollectionAllocations(items, { a: "1000" }, { a: "12000" }, false)[0]
      ?.nextPendingMinor,
  ).toBe(1200000);
  expect(
    accountCollectionAllocations(items, { a: "2000" }, { a: "8000" }, true),
  ).toEqual([{ saleItemId: "a", amountMinor: 200000 }]);
});
