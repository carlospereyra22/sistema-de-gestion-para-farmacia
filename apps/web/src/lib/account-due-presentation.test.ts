import { expect, it } from "vitest";
import {
  chronologicalEvents,
  matchesDuePeriod,
} from "./account-due-presentation";
import type { AccountDueRow } from "./account-due-dates";
import { preferredDueSale } from "./account-due-presentation";

it("shows the sale before later payments and adjustments without mutating the response", () => {
  const events = [
    { id: "adjustment", at: "2026-10-12T03:57:00Z" },
    { id: "payment", at: "2026-10-12T03:56:30Z" },
    { id: "sale", at: "2026-10-12T03:56:00Z" },
  ];
  expect(chronologicalEvents(events).map((event) => event.id)).toEqual([
    "sale",
    "payment",
    "adjustment",
  ]);
  expect(events[0].id).toBe("adjustment");
});

const row: AccountDueRow = {
  saleId: "sale",
  customerId: "customer",
  customerName: "Abel",
  saleDate: null,
  dueDate: "2026-11-01",
  pendingMinor: "100",
  status: "UPCOMING",
  daysOverdue: 0,
  reviewReason: null,
};
it("filters saved civil due dates across month boundaries, including endpoints", () => {
  expect(matchesDuePeriod(row, "all")).toBe(true);
  expect(matchesDuePeriod(row, "7", "2026-10-25")).toBe(true);
  expect(matchesDuePeriod(row, "7", "2026-10-24")).toBe(false);
  expect(matchesDuePeriod(row, "30", "2026-10-02")).toBe(true);
  expect(matchesDuePeriod(row, "today", "2026-11-01")).toBe(true);
  expect(matchesDuePeriod(row, "7", "2026-11-02")).toBe(false);
});
it("does not infer dates for undated sales or while today is unavailable", () => {
  expect(matchesDuePeriod({ ...row, dueDate: null }, "undated")).toBe(true);
  expect(
    matchesDuePeriod({ ...row, dueDate: null }, "today", "2026-11-01"),
  ).toBe(false);
  expect(matchesDuePeriod(row, "7")).toBe(false);
});

it("prefers the most overdue sale, then the nearest due date, without mutating rows", () => {
  const rows: AccountDueRow[] = [
    { ...row, saleId: "upcoming", dueDate: "2026-11-01" },
    {
      ...row,
      saleId: "late",
      status: "OVERDUE",
      daysOverdue: 3,
      dueDate: "2026-10-10",
    },
    {
      ...row,
      saleId: "oldest-late",
      status: "OVERDUE",
      daysOverdue: 12,
      dueDate: "2026-10-01",
    },
    { ...row, saleId: "today", status: "TODAY", dueDate: "2026-10-13" },
  ];
  expect(preferredDueSale(rows)).toBe("oldest-late");
  expect(preferredDueSale(rows.filter((r) => r.status !== "OVERDUE"))).toBe(
    "today",
  );
  expect(rows[0].saleId).toBe("upcoming");
});
it("falls back to the oldest undated sale, and leaves empty results empty", () => {
  expect(
    preferredDueSale([
      {
        ...row,
        saleId: "new",
        status: "UNDATED",
        dueDate: null,
        saleDate: "2026-10-12",
      },
      {
        ...row,
        saleId: "old",
        status: "UNDATED",
        dueDate: null,
        saleDate: "2026-10-01",
      },
    ]),
  ).toBe("old");
  expect(preferredDueSale([])).toBe("");
});
