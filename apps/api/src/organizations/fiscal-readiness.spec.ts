import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { FiscalPointDto } from "./fiscal-point.dto";
import { fiscalReadiness } from "./fiscal-readiness";

it("does not enable issuance even with a complete local profile and point", () => {
  for (const vatCondition of ["MONOTAX", "REGISTERED", "EXEMPT"]) {
    const result = fiscalReadiness(
      {
        legalName: "Comercio",
        cuit: "20247237837",
        vatCondition,
        address: "Calle 1",
        city: "Posadas",
        province: "Misiones",
        activityStart: "2020-01-01",
      },
      1,
    );
    expect(result.issuanceEnabled).toBe(false);
    expect(result.environment).toBe("HOMOLOGATION");
    expect(result.checks.map((check) => check.ready)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  }
});
it("reports incomplete and invalid stored profiles without inventing a tax regime", () => {
  expect(fiscalReadiness(null, 0).checks.every((check) => !check.ready)).toBe(
    true,
  );
  expect(
    fiscalReadiness(
      { cuit: "123", vatCondition: "UNKNOWN", activityStart: "2025-02-29" },
      0,
    ).checks[0]?.ready,
  ).toBe(false);
});
it("accepts only an explicit branch and a bounded integer point number", () => {
  const branchId = "550e8400-e29b-41d4-a716-446655440000";
  for (const number of [1, 99999])
    expect(
      validateSync(plainToInstance(FiscalPointDto, { branchId, number })),
    ).toHaveLength(0);
  for (const number of [0, -1, 100000, 1.5, "1", null])
    expect(
      validateSync(plainToInstance(FiscalPointDto, { branchId, number }))
        .length,
    ).toBeGreaterThan(0);
  expect(
    validateSync(
      plainToInstance(FiscalPointDto, { branchId: "foreign", number: 1 }),
    ).length,
  ).toBeGreaterThan(0);
});
