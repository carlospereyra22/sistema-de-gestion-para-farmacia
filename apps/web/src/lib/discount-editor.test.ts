import { expect, it } from "vitest";
import {
  discountDraft,
  parseDiscountDraft,
  paymentsAfterDiscount,
} from "./discount-editor";

it("starts empty instead of leaving an initial zero and preserves cents", () => {
  expect(discountDraft(0)).toBe("");
  expect(discountDraft(12050)).toBe("120,50");
  expect(parseDiscountDraft("")).toBe(0);
  expect(parseDiscountDraft("0121")).toBe(12100);
  expect(parseDiscountDraft("1.000,50")).toBe(100050);
  expect(parseDiscountDraft("1000.50")).toBe(100050);
  expect(parseDiscountDraft("1.000")).toBe(100000);
  for (const value of ["-100", "abc", "1,2,3", "1,234", "99999999999999999999"])
    expect(parseDiscountDraft(value)).toBeUndefined();
});
it("reduces pending account allocation when discounting, without mutating it", () => {
  const payments = [{ method: "ACCOUNT" as const, amountMinor: 10000 }];
  expect(paymentsAfterDiscount(8500, payments)).toEqual([
    { method: "ACCOUNT", amountMinor: 8500 },
  ]);
  expect(payments[0]!.amountMinor).toBe(10000);
  expect(paymentsAfterDiscount(0, payments)).toEqual([]);
});
it("preserves real payment amounts and only reduces account financing", () => {
  expect(
    paymentsAfterDiscount(8000, [
      { method: "TRANSFER", amountMinor: 3000 },
      { method: "ACCOUNT", amountMinor: 7000 },
    ]),
  ).toEqual([
    { method: "TRANSFER", amountMinor: 3000 },
    { method: "ACCOUNT", amountMinor: 5000 },
  ]);
  expect(
    paymentsAfterDiscount(2000, [
      { method: "CASH", amountMinor: 3000 },
      { method: "ACCOUNT", amountMinor: 7000 },
    ]),
  ).toEqual([{ method: "CASH", amountMinor: 3000 }]);
  expect(() =>
    paymentsAfterDiscount(2000, [
      { method: "CARD", amountMinor: 3000 },
      { method: "ACCOUNT", amountMinor: 7000 },
    ]),
  ).toThrow("tarjeta o transferencia");
});
it("does not increase financing when a discount is removed", () => {
  expect(
    paymentsAfterDiscount(10000, [{ method: "ACCOUNT", amountMinor: 8000 }]),
  ).toEqual([{ method: "ACCOUNT", amountMinor: 8000 }]);
});
