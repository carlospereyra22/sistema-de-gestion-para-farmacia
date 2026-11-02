import { describe, expect, it } from "vitest";
import { amountTypingSuffix, formatAmountTyping } from "./amount-typing";

describe("amount typing", () => {
  it.each([
    ["1000", "1.000"],
    ["20792", "20.792"],
    ["1.0000", "10.000"],
    ["1234567", "1.234.567"],
    ["007", "7"],
    ["1000,5", "1.000,5"],
    ["1000,555", "1.000,55"],
    [",5", "0,5"],
    ["1,2,3", "1,23"],
    ["$ 50a0", "500"],
    ["", ""],
  ])("formats %s as %s", (value, expected) => {
    expect(formatAmountTyping(value)).toBe(expected);
  });

  it.each([
    ["1.000", ",00"],
    ["1.000,", "00"],
    ["1.000,5", "0"],
    ["1.000,50", ""],
    ["", ""],
  ])("completes %s with %s", (value, expected) => {
    expect(amountTypingSuffix(value)).toBe(expected);
  });
});
