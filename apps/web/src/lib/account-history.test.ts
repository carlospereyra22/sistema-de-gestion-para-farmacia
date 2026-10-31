import { expect, it } from "vitest";
import { filterAccountHistory } from "./account-history";
import type { CustomerAccount } from "./api";
it("separates sales and receipts without treating adjustments or cancellations as either", () => {
  const base = {
    id: "sale",
    createdAt: "2026-10-01",
    amountMinor: "100",
    note: null,
    type: "DEBIT" as const,
    saleId: "s",
  };
  const movements: CustomerAccount["movements"] = [
    base,
    { ...base, id: "price", isPriceAdjustment: true },
    { ...base, id: "manual", isDebtAdjustment: true },
    { ...base, id: "cancel", type: "CREDIT" },
    { ...base, id: "receipt", type: "CREDIT", saleId: null },
  ];
  expect(filterAccountHistory(movements, "all")).toHaveLength(5);
  expect(filterAccountHistory(movements, "sales").map((m) => m.id)).toEqual([
    "sale",
  ]);
  expect(filterAccountHistory(movements, "receipts").map((m) => m.id)).toEqual([
    "receipt",
  ]);
});
