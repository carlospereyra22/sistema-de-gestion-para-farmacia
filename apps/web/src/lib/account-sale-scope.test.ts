import { expect, it } from "vitest";
import { scopeAccountItems } from "./account-sale-scope";
import { prepareAccountDelivery } from "./account-delivery";
import { dueSaleSelection } from "./account-payment-allocation";
import type { AccountItems } from "./api";
const data: AccountItems = {
  balanceMinor: "3000000",
  unassignedReceipts: [],
  mixedSales: [],
  items: ["old", "target"].map((saleId) => ({
    saleId,
    saleItemId: `item-${saleId}`,
    name: "Producto",
    quantity: 1,
    financedMinor: "1500000",
    paidMinor: "0",
    pendingMinor: "1500000",
    createdAt: "2026-10-01T12:00:00Z",
    previousPriceMinor: "1500000",
    referencePriceMinor: null,
    referenceCheckedAt: null,
    increaseMinor: "0",
  })),
};
it("keeps full and partial collections confined to the selected sale without changing the account", () => {
  const original = JSON.stringify(data);
  const scoped = scopeAccountItems(data, "target");
  expect(scoped.balanceMinor).toBe("1500000");
  expect(dueSaleSelection(scoped, "target")).toEqual({
    page: 1,
    chosen: { "item-target": "15000" },
  });
  expect(prepareAccountDelivery(scoped, "10.000").chosen).toEqual({
    "item-target": "10000.00",
  });
  expect(() => prepareAccountDelivery(scoped, "20.000")).toThrow();
  expect(JSON.stringify(data)).toBe(original);
  expect(scopeAccountItems(data)).toBe(data);
});
it("preserves reconciliation safeguards and does not fall back to another sale", () => {
  expect(scopeAccountItems(data, "missing").items).toEqual([]);
  const incomplete = {
    ...data,
    unassignedReceipts: [
      {
        id: "unassigned",
        amountMinor: "100",
        createdAt: "2026-10-01T12:00:00Z",
      },
    ],
  };
  expect(() =>
    prepareAccountDelivery(scopeAccountItems(incomplete, "target"), "1"),
  ).toThrow("conciliá");
});
