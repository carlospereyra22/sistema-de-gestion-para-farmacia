import {
  normalizeReceiptPayments,
  readReceiptPayments,
} from "./receipt-payments";
import { readAllocations } from "./item-allocations";
describe("mixed receipt payments", () => {
  it("validates exact totals and supports historical single methods", () => {
    expect(
      normalizeReceiptPayments(1929000, "OTHER", [
        { method: "CASH", amountMinor: 1000000 },
        { method: "CARD", amountMinor: 929000 },
      ]),
    ).toEqual([
      { method: "CARD", amountMinor: 929000 },
      { method: "CASH", amountMinor: 1000000 },
    ]);
    expect(normalizeReceiptPayments(100, "TRANSFER")).toEqual([
      { method: "TRANSFER", amountMinor: 100 },
    ]);
    expect(() => normalizeReceiptPayments(100, "OTHER")).toThrow();
    expect(() =>
      normalizeReceiptPayments(100, "OTHER", [
        { method: "CASH", amountMinor: 50 },
        { method: "CARD", amountMinor: 49 },
      ]),
    ).toThrow();
    expect(() =>
      normalizeReceiptPayments(100, "OTHER", [
        { method: "CASH", amountMinor: 50 },
        { method: "CASH", amountMinor: 50 },
      ]),
    ).toThrow();
    expect(() =>
      normalizeReceiptPayments(100, "OTHER", [
        { method: "CASH", amountMinor: -50 },
        { method: "CARD", amountMinor: 150 },
      ]),
    ).toThrow();
    expect(() =>
      normalizeReceiptPayments(100, "CASH", [
        { method: "CASH", amountMinor: 50 },
        { method: "CARD", amountMinor: 50 },
      ]),
    ).toThrow();
  });
  it("reads allocations and tender parts without confusing debt adjustments", () => {
    const items = [{ saleItemId: "item", amountMinor: 100 }];
    const payments = [
      { method: "CASH", amountMinor: 60 },
      { method: "TRANSFER", amountMinor: 40 },
    ];
    expect(readAllocations({ kind: "MIXED_RECEIPT", items, payments })).toEqual(
      items,
    );
    expect(
      readReceiptPayments({ kind: "MIXED_RECEIPT", items, payments }),
    ).toEqual(payments);
    expect(readAllocations({ kind: "MANUAL_DEBT_ADJUSTMENT", items })).toEqual(
      [],
    );
  });
});
