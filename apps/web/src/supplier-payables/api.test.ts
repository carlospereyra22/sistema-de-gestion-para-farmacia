import { expect, it } from "vitest";
import { ars, inputMinor, dateLabel, purchaseAmountInput } from "./api";
it("prefills a purchase amount as an editable exact decimal", () => {
  expect(purchaseAmountInput("14400000")).toBe("144000,00");
  expect(purchaseAmountInput("29")).toBe("0,29");
  expect(purchaseAmountInput()).toBe("");
  expect(inputMinor(purchaseAmountInput("99999999999999"))).toBe(
    "99999999999999",
  );
});
it("converts decimal amounts exactly without floating point", () => {
  expect(inputMinor("500000,01")).toBe("50000001");
  expect(inputMinor("0.29")).toBe("29");
  expect(inputMinor("999999999999.99")).toBe("99999999999999");
  for (const bad of ["", "0", "-1", "1.234", "1.000,50", "NaN", "Infinity"])
    expect(() => inputMinor(bad)).toThrow();
});
it("formats Argentine money and civil dates without timezone shifts", () => {
  expect(ars("50000001")).toBe("$ 500.000,01");
  expect(ars("-1")).toBe("−$ 0,01");
  expect(dateLabel("2026-10-20")).toBe("20/10/2026");
  expect(dateLabel(null)).toBe("Sin vencimiento");
});
