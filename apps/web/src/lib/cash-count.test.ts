import { expect, it } from "vitest";
import { cashCountMinor } from "./cash-count";

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
it("converts counted money to integer cents", () => {
  expect(cashCountMinor("15500")).toBe(1550000);
  expect(cashCountMinor("1,25")).toBe(125);
  expect(cashCountMinor("0.29")).toBe(29);
});
