import { expect, it } from "vitest";
import {
  matchesDueFilter,
  scopeDueRows,
  type AccountDueRow,
} from "./account-due-dates";
const row: AccountDueRow = {
  saleId: "sale",
  customerId: "customer",
  customerName: "April",
  saleDate: null,
  dueDate: "2026-10-10",
  pendingMinor: "6000000",
  daysOverdue: 1,
  status: "OVERDUE",
  reviewReason: null,
};
it("separates the aging ranges at their boundaries", () => {
  for (const [days, filter] of [
    [1, "1-15"],
    [15, "1-15"],
    [16, "16-30"],
    [30, "16-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "60+"],
  ] as const)
    expect(matchesDueFilter({ ...row, daysOverdue: days }, filter)).toBe(true);
  expect(matchesDueFilter({ ...row, daysOverdue: 16 }, "1-15")).toBe(false);
});
it("does not classify undated or unreconciled balances as overdue", () => {
  expect(matchesDueFilter({ ...row, status: "REVIEW" }, "1-15")).toBe(false);
  expect(matchesDueFilter({ ...row, status: "UNDATED" }, "UNDATED")).toBe(true);
  expect(matchesDueFilter({ ...row, status: "TODAY" }, "UPCOMING")).toBe(false);
  expect(matchesDueFilter(row, "ALL")).toBe(true);
});
it("scopes all due-date metrics and filters to the selected customer", () => {
  const rows = [row, { ...row, saleId: "other-sale", customerId: "other" }];
  expect(scopeDueRows(rows, "customer")).toEqual([row]);
  expect(scopeDueRows(rows, "missing")).toEqual([]);
  expect(scopeDueRows(rows)).toEqual(rows);
  expect(
    scopeDueRows(rows, "other").every((item) => item.customerId === "other"),
  ).toBe(true);
});
