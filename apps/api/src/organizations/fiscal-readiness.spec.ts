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
    expect(result.checks.map((check) => check.code)).toEqual([
      "PROFILE",
      "AUTH",
      "POINT",
      "TRIAL",
      "PRODUCTION",
    ]);
    expect(result.checks.map((check) => check.ready)).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
  }
});

describe("estado de cada paso con lo que sabe el servidor (SISTEMA-95)", () => {
  const perfil = {
    legalName: "Comercio",
    cuit: "20247237837",
    vatCondition: "MONOTAX",
    address: "Calle 1",
    city: "Posadas",
    province: "Misiones",
    activityStart: "2020-01-01",
  };
  const check = (code: string, extra: Parameters<typeof fiscalReadiness>[2]) =>
    fiscalReadiness(perfil, 1, extra).checks.find((c) => c.code === code)!;

  it("la conexión queda lista con el certificado conectado", () => {
    expect(check("AUTH", {}).ready).toBe(false);
    const conectada = check("AUTH", {
      connectedAt: new Date("2026-11-10T15:00:00Z"),
    });
    expect(conectada.ready).toBe(true);
    expect(conectada.detail).toBe("Conectada con ARCA el 10/11/2026.");
  });

  it.each([
    [{ authorized: true, last: null }, true, "autorizó"],
    [{ authorized: false, last: null }, false, "Todavía no hiciste"],
    [
      {
        authorized: false,
        last: { status: "UNCERTAIN", point: 1, number: 7 },
      },
      false,
      "0001-00000007 espera respuesta",
    ],
    [
      { authorized: false, last: { status: "REJECTED", point: 1, number: 7 } },
      false,
      "rechazó",
    ],
  ])("factura de prueba %#", (trial, ready, texto) => {
    const paso = check("TRIAL", { trial });
    expect(paso.ready).toBe(ready);
    expect(paso.detail).toContain(texto);
  });

  it("facturación real cuenta las sucursales activadas", () => {
    expect(check("PRODUCTION", {}).ready).toBe(false);
    expect(check("PRODUCTION", { productionBranches: 2 }).detail).toBe(
      "2 sucursales facturan en real.",
    );
  });

  it("los textos no usan jerga técnica", () => {
    const textos = JSON.stringify(fiscalReadiness(perfil, 0).checks);
    for (const jerga of ["WSAA", "WSFE", "conector", "servicio fiscal"])
      expect(textos).not.toContain(jerga);
  });
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
