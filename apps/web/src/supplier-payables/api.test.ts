import { expect, it } from "vitest";
import {
  ars,
  inputMinor,
  dateLabel,
  moneyAmount,
  moneyInputMinor,
  purchaseAmountInput,
} from "./api";
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
it("lee los importes de MoneyInput con puntos de miles", () => {
  expect(moneyInputMinor("1.234")).toBe("123400");
  expect(moneyInputMinor("1.000,50")).toBe("100050");
  expect(moneyInputMinor("531.393,07")).toBe("53139307");
  expect(moneyInputMinor("700,")).toBe("70000");
  expect(moneyInputMinor("700")).toBe("70000");
  expect(moneyAmount("53139307")).toBe("531.393,07");
  expect(moneyAmount()).toBe("");
  expect(moneyInputMinor(moneyAmount("99999999999999"))).toBe("99999999999999");
});
it("no multiplica por cien un borrador con punto decimal", () => {
  expect(moneyInputMinor("1000.50")).toBe("100050");
  expect(moneyInputMinor("0.29")).toBe("29");
  for (const bad of ["", "0", "1.23.4", "12.34.56"])
    expect(() => moneyInputMinor(bad)).toThrow();
});
