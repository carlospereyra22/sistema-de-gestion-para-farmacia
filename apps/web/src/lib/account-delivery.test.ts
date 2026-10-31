import { expect, it } from "vitest";
import type { AccountItems } from "./api";
import {
  parseAccountDelivery,
  prepareAccountDelivery,
} from "./account-delivery";

const row = (
  saleItemId: string,
  saleId: string,
  pendingMinor: string,
  createdAt: string,
) => ({
  saleItemId,
  saleId,
  pendingMinor,
  createdAt,
  name: saleItemId,
  quantity: 1,
  financedMinor: pendingMinor,
  paidMinor: "0",
  previousPriceMinor: "0",
  referencePriceMinor: null,
  referenceCheckedAt: null,
  increaseMinor: "0",
});
const data: AccountItems = {
  balanceMinor: "24000000",
  unassignedReceipts: [],
  mixedSales: [],
  items: [
    row("new", "sale-new", "14000000", "2026-10-09T12:00:00Z"),
    row("old", "sale-old", "10000000", "2026-10-01T12:00:00Z"),
  ],
};

it.each(["180000", "180.000", "180000,00", "180.000,00", "180000.00"])(
  "accepts local receipt format %s",
  (value) => {
    expect(parseAccountDelivery(value)).toBe(18000000);
  },
);
it("handles cents exactly and rejects ambiguous/invalid/unsafe input", () => {
  expect(parseAccountDelivery("1.234,56")).toBe(123456);
  expect(parseAccountDelivery("0,01")).toBe(1);
  for (const value of [
    "",
    "0",
    "-1",
    "1e5",
    "180k",
    "1,234.56",
    "12.34.56",
    "NaN",
    "999999999999999999",
  ])
    expect(parseAccountDelivery(value)).toBeNull();
});
it("proposes 180k against 240k oldest first, leaving 60k without changing the source", () => {
  const original = JSON.stringify(data);
  expect(prepareAccountDelivery(data, "180.000")).toEqual({
    chosen: { old: "100000.00", new: "80000.00" },
    amountMinor: 18000000,
    balanceAfterMinor: "6000000",
  });
  expect(JSON.stringify(data)).toBe(original);
});
it("supports partial payment of a single article and later payment of the rest", () => {
  const single = {
    ...data,
    items: [row("only", "sale", "24000000", "2026-10-01")],
  };
  expect(prepareAccountDelivery(single, "180000").chosen).toEqual({
    only: "180000.00",
  });
  const after = {
    ...single,
    balanceMinor: "6000000",
    items: [
      { ...single.items[0], paidMinor: "18000000", pendingMinor: "6000000" },
    ],
  };
  expect(prepareAccountDelivery(after, "60.000").balanceAfterMinor).toBe("0");
});
it("ignores paid rows and splits cents exactly with stable ordering for equal dates", () => {
  const small = {
    ...data,
    balanceMinor: "3",
    items: [
      row("b", "same", "2", "2026-10-01"),
      row("a", "same", "1", "2026-10-01"),
      row("paid", "same", "0", ""),
    ],
  };
  expect(prepareAccountDelivery(small, "0,02").chosen).toEqual({
    a: "0.01",
    b: "0.01",
  });
  expect(
    prepareAccountDelivery(
      { ...small, items: [...small.items].reverse() },
      "0,02",
    ),
  ).toEqual(prepareAccountDelivery(small, "0,02"));
});
it("rejects overpayments, unreconciled history, missing dates and mismatched balances", () => {
  expect(() => prepareAccountDelivery(data, "240001")).toThrow("superar");
  expect(() =>
    prepareAccountDelivery(
      {
        ...data,
        unassignedReceipts: [
          { id: "legacy", amountMinor: "1", createdAt: "2026-10-01" },
        ],
      },
      "1",
    ),
  ).toThrow("conciliá");
  expect(() =>
    prepareAccountDelivery(
      {
        ...data,
        mixedSales: [
          {
            saleId: "mixed",
            movementId: "debit",
            financedMinor: "1",
            items: [],
          },
        ],
      },
      "1",
    ),
  ).toThrow("conciliá");
  expect(() =>
    prepareAccountDelivery({ ...data, balanceMinor: "25000000" }, "1"),
  ).toThrow("no coincide");
  expect(() =>
    prepareAccountDelivery(
      {
        ...data,
        items: data.items.map((item) => ({ ...item, createdAt: null })),
      },
      "1",
    ),
  ).toThrow("Faltan fechas");
});
it("never allocates beyond any remaining article balance across different amounts", () => {
  for (const amount of [
    "0,01",
    "99999,99",
    "100000",
    "100000,01",
    "239999,99",
    "240000",
  ]) {
    const proposal = prepareAccountDelivery(data, amount);
    const applied = Object.entries(proposal.chosen).map(([id, value]) => {
      const minor = parseAccountDelivery(value)!;
      expect(minor).toBeLessThanOrEqual(
        Number(data.items.find((item) => item.saleItemId === id)!.pendingMinor),
      );
      return minor;
    });
    expect(applied.reduce((sum, value) => sum + value, 0)).toBe(
      proposal.amountMinor,
    );
  }
});
