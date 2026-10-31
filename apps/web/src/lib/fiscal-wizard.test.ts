import { expect, it } from "vitest";
import { resumeFiscalStep } from "./fiscal-wizard";

const check = (code: string, ready: boolean) => ({
  code,
  ready,
  label: code,
  detail: "",
});
it("starts safely when checks are missing or incomplete", () => {
  expect(resumeFiscalStep([])).toBe(0);
  expect(
    resumeFiscalStep([check("PROFILE", false), check("POINT", true)]),
  ).toBe(0);
});
it("resumes from saved server checks, never treating local setup as connected", () => {
  expect(resumeFiscalStep([check("PROFILE", true)])).toBe(1);
  expect(
    resumeFiscalStep([check("PROFILE", true), check("POINT", false)]),
  ).toBe(1);
  expect(resumeFiscalStep([check("PROFILE", true), check("POINT", true)])).toBe(
    1,
  );
  expect(
    resumeFiscalStep([
      check("PROFILE", true),
      check("POINT", true),
      check("AUTH", true),
    ]),
  ).toBe(3);
  expect(
    resumeFiscalStep([
      check("PROFILE", true),
      check("AUTH", true),
      check("POINT", false),
    ]),
  ).toBe(2);
});
