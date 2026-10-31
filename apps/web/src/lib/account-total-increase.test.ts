import { expect, it } from "vitest";
import { accountTotalIncrease } from "./account-total-increase";
it("previews percent or exact total with safe cent rounding", () => {
  expect(accountTotalIncrease(1929000, "percent", "10")).toBe(2121900);
  expect(accountTotalIncrease(1929000, "amount", "21.219,00")).toBe(2121900);
  expect(accountTotalIncrease(101, "percent", "0,5")).toBe(102);
  expect(accountTotalIncrease(1929000, "percent", "-5")).toBeNull();
  expect(accountTotalIncrease(1929000, "amount", "10")).toBeNull();
  expect(
    accountTotalIncrease(Number.MAX_SAFE_INTEGER, "percent", "1"),
  ).toBeNull();
});
