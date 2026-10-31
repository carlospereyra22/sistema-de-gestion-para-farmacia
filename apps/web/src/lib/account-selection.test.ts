import { expect, it } from "vitest";
import {
  selectPendingItems,
  pendingSelectionState,
  adjustedPendingItems,
} from "./account-selection";
import { accountCollectionAllocations } from "./account-collection-allocation";
const sale = [
  { saleItemId: "a", pendingMinor: "1500" },
  { saleItemId: "b", pendingMinor: "2000" },
  { saleItemId: "paid", pendingMinor: "0" },
];
it("retains a confirmed 5000 balance across item, sale, clear and pay-all selection", () => {
  const original = [{ saleItemId: "actron", pendingMinor: "956500" }];
  const adjusted = { actron: "5000" };
  const preview = adjustedPendingItems(original, adjusted);
  let chosen = selectPendingItems({}, preview, true);
  expect(chosen).toEqual({ actron: "5000" });
  expect(pendingSelectionState(chosen, preview).checked).toBe(true);
  chosen = selectPendingItems(chosen, preview, false);
  expect(chosen).toEqual({});
  expect(adjustedPendingItems(original, adjusted)[0]?.pendingMinor).toBe(
    "500000",
  );
  expect(
    accountCollectionAllocations(original, chosen, adjusted, false),
  ).toEqual([]);
  chosen = selectPendingItems(
    chosen,
    adjustedPendingItems(original, adjusted),
    true,
  );
  expect(
    accountCollectionAllocations(original, chosen, adjusted, false),
  ).toEqual([
    {
      saleItemId: "actron",
      amountMinor: 500000,
      expectedPendingMinor: 956500,
      nextPendingMinor: 500000,
    },
  ]);
  expect(selectPendingItems({}, preview, true)).toEqual(chosen);
  expect(original[0]?.pendingMinor).toBe("956500");
  expect(adjustedPendingItems(original, adjusted, false)).toEqual(original);
});
it("selects an entire sale without including paid items", () => {
  expect(selectPendingItems({}, sale, true)).toEqual({ a: "15", b: "20" });
});
it("preserves other sales and toggles a sale off", () => {
  expect(
    selectPendingItems({ a: "15", b: "20", other: "9" }, sale, false),
  ).toEqual({ other: "9" });
});
it("shows partial selection for partial amounts", () => {
  expect(pendingSelectionState({ a: "3", b: "20" }, sale)).toEqual({
    checked: false,
    partial: true,
  });
  expect(pendingSelectionState({ a: "15", b: "20" }, sale).checked).toBe(true);
});
it("repeated pay-all does not duplicate amounts", () => {
  const once = selectPendingItems({}, sale, true);
  expect(selectPendingItems(once, sale, true)).toEqual(once);
});
