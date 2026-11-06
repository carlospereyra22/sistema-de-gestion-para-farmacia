import { expect, it } from "vitest";
import {
  creditLimitMinor,
  creditLimitText,
  limitEnablesCredit,
  proposesPaymentTerm,
} from "./account-credit-limit";

it("muestra el límite guardado con miles y centavos solo si los tiene", () => {
  expect(creditLimitText("80000000")).toBe("800.000");
  expect(creditLimitText("100050")).toBe("1.000,50");
  expect(creditLimitText("50")).toBe("0,50");
});
it("deja vacío el límite cero para no pegar lo escrito al 0", () => {
  expect(creditLimitText("0")).toBe("");
  expect(creditLimitText(null)).toBe("");
  expect(creditLimitText(undefined)).toBe("");
});
it("convierte a centavos sin confundir los puntos de miles", () => {
  expect(creditLimitMinor("800.000")).toBe(80000000);
  expect(creditLimitMinor("1.000,50")).toBe(100050);
  expect(creditLimitMinor("")).toBe(0);
  expect(creditLimitMinor("abc")).toBeNull();
});
it("vuelve al mismo importe después de mostrarlo", () => {
  for (const minor of ["80000000", "100050", "50", "199"])
    expect(String(creditLimitMinor(creditLimitText(minor)))).toBe(minor);
});
it("propone A plazo solo si la cuenta todavía no tiene condiciones", () => {
  expect(
    proposesPaymentTerm({ creditLimitMinor: "0", accountTermDays: null }),
  ).toBe(true);
  expect(proposesPaymentTerm({ creditLimitMinor: "0" })).toBe(true);
});
it("respeta Sin vencimiento cuando ya hay condiciones guardadas", () => {
  expect(
    proposesPaymentTerm({
      creditLimitMinor: "80000000",
      accountTermDays: null,
    }),
  ).toBe(false);
  expect(
    proposesPaymentTerm({ creditLimitMinor: null, accountTermDays: null }),
  ).toBe(false);
  expect(
    proposesPaymentTerm({ creditLimitMinor: "0", accountTermDays: 30 }),
  ).toBe(false);
});
it("solo un importe mayor a cero habilita el crédito", () => {
  expect(limitEnablesCredit("800.000")).toBe(true);
  expect(limitEnablesCredit("0,50")).toBe(true);
  expect(limitEnablesCredit("0")).toBe(false);
  expect(limitEnablesCredit("")).toBe(false);
});
