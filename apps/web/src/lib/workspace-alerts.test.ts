import { expect, it } from "vitest";
import { accountAlerts, stockAlerts } from "./workspace-alerts";
import type { AccountDueRow } from "./account-due-dates";
import type { StockLot } from "./api";
const row: AccountDueRow = {
  saleId: "sale",
  customerId: "client",
  customerName: "Ana",
  saleDate: "2026-09-01",
  dueDate: "2026-10-01",
  pendingMinor: "10000",
  daysOverdue: 2,
  status: "OVERDUE",
  reviewReason: null,
};
it("only warns about confirmed overdue pending balances", () => {
  expect(
    accountAlerts([
      row,
      { ...row, saleId: "today", status: "TODAY" },
      { ...row, saleId: "review", status: "REVIEW", pendingMinor: null },
      { ...row, saleId: "paid", pendingMinor: "0" },
    ]),
  ).toHaveLength(1);
  expect(accountAlerts([row])[0].detail).toContain("2 días de atraso");
});
const products = [
  { id: "one", name: "Uno", active: true },
  { id: "two", name: "Dos", active: true },
  { id: "archived", name: "Archivado", active: false },
];
const lot: StockLot = {
  id: "lot",
  productId: "one",
  productName: "Uno",
  number: "A",
  quantity: 8,
  sellableQuantity: 8,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  expiresAt: null,
  unitCostMinor: "100",
  metadataVersion: 1,
};
it("sums sellable lots and ignores archived products", () => {
  const alerts = stockAlerts(
    products,
    [
      { ...lot, quantity: 3, sellableQuantity: 3 },
      { ...lot, id: "lot2", quantity: 3, sellableQuantity: 3 },
    ],
    5,
  );
  expect(alerts.map((alert) => alert.id)).toEqual(["stock:two"]);
  expect(
    stockAlerts(
      products,
      [{ ...lot, quantity: 5, sellableQuantity: 5 }],
      5,
    ).map((alert) => alert.id),
  ).toContain("stock:one");
});
it("includes expired and upcoming lots without treating expired stock as sellable", () => {
  const alerts = stockAlerts(
    products,
    [
      {
        ...lot,
        sellableQuantity: 0,
        expiredQuantity: 8,
        expiryStatus: "EXPIRED",
        expiresAt: "2026-10-01",
      },
      {
        ...lot,
        id: "soon",
        expiryStatus: "EXPIRING_SOON",
        expiresAt: "2026-11-01",
      },
    ],
    5,
  );
  expect(alerts.map((alert) => alert.id)).toContain("expiry:lot");
  expect(alerts.map((alert) => alert.id)).toContain("expiry:soon");
  expect(
    stockAlerts(
      products,
      [
        {
          ...lot,
          sellableQuantity: 0,
          expiredQuantity: 8,
          expiryStatus: "EXPIRED",
        },
      ],
      0,
    ).find((alert) => alert.id === "stock:one")?.detail,
  ).toContain("Sin stock");
  expect(
    stockAlerts(
      products,
      [{ ...lot, quantity: 0, sellableQuantity: 0, expiryStatus: "EXPIRED" }],
      0,
    ).some((alert) => alert.id === "expiry:lot"),
  ).toBe(false);
});
