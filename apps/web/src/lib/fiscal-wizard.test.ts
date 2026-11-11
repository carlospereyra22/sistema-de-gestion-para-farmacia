import { expect, it } from "vitest";
import { resumeFiscalStep } from "./fiscal-wizard";

const check = (code: string, ready: boolean) => ({
  code,
  ready,
  label: code,
  detail: "",
});
it("arranca de cero si faltan los checks o los datos", () => {
  expect(resumeFiscalStep([])).toBe(0);
  expect(
    resumeFiscalStep([check("PROFILE", false), check("POINT", true)]),
  ).toBe(0);
});
it("retoma en el primer paso que el servidor no da por listo", () => {
  expect(resumeFiscalStep([check("PROFILE", true)])).toBe(1);
  expect(resumeFiscalStep([check("PROFILE", true), check("POINT", true)])).toBe(
    1,
  );
  expect(
    resumeFiscalStep([
      check("PROFILE", true),
      check("AUTH", true),
      check("POINT", false),
    ]),
  ).toBe(2);
  expect(
    resumeFiscalStep([
      check("PROFILE", true),
      check("AUTH", true),
      check("POINT", true),
    ]),
  ).toBe(3);
  expect(
    resumeFiscalStep([
      check("PROFILE", true),
      check("AUTH", true),
      check("POINT", true),
      check("TRIAL", true),
    ]),
  ).toBe(4);
});
