import { expect, it } from "vitest";
import { cashCountMinor, typedCashMinor } from "./cash-count";

it("does not treat empty counts as zero", () => {
  for (const value of [
    "",
    " ",
    "-1",
    "1.234",
    "1e3",
    "abc",
    "999999999999999999",
  ])
    expect(cashCountMinor(value)).toBeNull();
  expect(cashCountMinor("0")).toBe(0);
});
it("lee los importes de MoneyInput con miles y centavos, sin float", () => {
  expect(typedCashMinor("1.234,56")).toBe(123456);
  expect(typedCashMinor("20.792")).toBe(2079200);
  expect(typedCashMinor("1.000,")).toBe(100000);
  expect(typedCashMinor("0,29")).toBe(29);
  expect(typedCashMinor("1,1")).toBe(110);
  expect(typedCashMinor("4,35")).toBe(435);
  expect(typedCashMinor("")).toBeNull();
  expect(typedCashMinor(",")).toBeNull();
});
it("converts counted money to integer cents", () => {
  expect(cashCountMinor("15500")).toBe(1550000);
  expect(cashCountMinor("1,25")).toBe(125);
  expect(cashCountMinor("0.29")).toBe(29);
});
