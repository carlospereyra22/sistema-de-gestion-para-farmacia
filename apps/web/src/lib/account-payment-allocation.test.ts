import { expect, it } from "vitest";
import type { AccountItems } from "./api";
import {
  dueSaleSelection,
  paymentAllocationSummary,
} from "./account-payment-allocation";
import { prepareAccountDelivery } from "./account-delivery";
const item = (saleId: string, pendingMinor: string) => ({
  saleId,
  saleItemId: `item-${saleId}`,
  pendingMinor,
  financedMinor: pendingMinor,
  paidMinor: "0",
  name: "Actron",
  quantity: 1,
  createdAt: "2026-10-01T12:00:00Z",
  previousPriceMinor: pendingMinor,
  referencePriceMinor: null,
  referenceCheckedAt: null,
  increaseMinor: "0",
});
const data: AccountItems = {
  balanceMinor: "3000000",
  items: [item("a", "1500000"), item("b", "1500000")],
  mixedSales: [],
  unassignedReceipts: [],
};
it("shows zero remaining for final settlement above or below pending, preserving partial deliveries", () => {
  for (const amount of ["12000", "18000", "8000"]) {
    expect(
      paymentAllocationSummary(data.items, { "item-a": amount }, new Set())[0]
        ?.remaining,
    ).toBe(0);
  }
  expect(
    paymentAllocationSummary(
      data.items,
      { "item-a": "12000" },
      new Set(["item-a"]),
    )[0]?.remaining,
  ).toBe(300000);
});
it("explains which sale receives $10,000 and its remaining debt without changing prices", () => {
  const snapshot = JSON.stringify(data);
  const draft = prepareAccountDelivery(data, "10.000");
  expect(paymentAllocationSummary(data.items, draft.chosen)).toEqual([
    { saleId: "a", pending: 1500000, applied: 1000000, remaining: 500000 },
  ]);
  expect(JSON.stringify(data)).toBe(snapshot);
});
it("splits a payment between sales and omits invalid or empty selections", () => {
  expect(
    paymentAllocationSummary(
      data.items,
      prepareAccountDelivery(data, "20.000").chosen,
    ),
  ).toEqual([
    { saleId: "a", pending: 1500000, applied: 1500000, remaining: 0 },
    { saleId: "b", pending: 1500000, applied: 500000, remaining: 1000000 },
  ]);
  expect(paymentAllocationSummary(data.items, { "item-a": "invalid" })).toEqual(
    [],
  );
  expect(paymentAllocationSummary(data.items, { "item-a": "999999" })).toEqual(
    [],
  );
});
it("selects only the requested sale and reveals its page, without auto-collecting", () => {
  const many = {
    ...data,
    items: Array.from({ length: 7 }, (_, i) => item(`s${i}`, "10000")),
  };
  expect(dueSaleSelection(many, "s6")).toEqual({
    page: 2,
    chosen: { "item-s6": "100" },
  });
  expect(dueSaleSelection(many, "missing")).toBeNull();
  expect(
    dueSaleSelection({ ...data, items: [item("a", "0")] }, "a"),
  ).toBeNull();
});
