import { describe, expect, it } from "vitest";
import type { FiscalSetup } from "./api";
import { mensajeDeActivacion } from "./facturacion-real";
import {
  filasDePuntos,
  formatearPunto,
  opcionesDePuntosArca,
} from "./puntos-de-venta";

const setup = (points: FiscalSetup["points"]): FiscalSetup => ({
  environment: "HOMOLOGATION",
  issuanceEnabled: false,
  branches: [
    { id: "b1", name: "Centro" },
    { id: "b2", name: "Norte" },
  ],
  points,
  checks: [],
  trial: null,
  production: { available: false, branches: [] },
});

describe("punto de venta por sucursal (SISTEMA-98)", () => {
  it("una fila por sucursal con su punto activo y los desactivados", () => {
    const filas = filasDePuntos(
      setup([
        { id: "p1", branchId: "b1", number: 3, active: true },
        { id: "p2", branchId: "b1", number: 1, active: false },
      ]),
    );
    expect(
      filas.map(({ branch, activo, inactivos }) => [
        branch.name,
        activo?.number,
        inactivos.map(({ number }) => number),
      ]),
    ).toEqual([
      ["Centro", 3, [1]],
      ["Norte", undefined, []],
    ]);
  });

  it("ofrece los puntos de ARCA como 0003 · Web services sin los ya usados", () => {
    expect(formatearPunto(3)).toBe("0003");
    expect(
      opcionesDePuntosArca(
        [{ number: 1 }, { number: 3 }],
        [{ id: "p1", branchId: "b1", number: 1, active: false }],
      ),
    ).toEqual([{ value: "3", label: "0003 · Web services" }]);
  });

  it("al activar, lo que depende del servidor no muestra errores técnicos", () => {
    expect(
      mensajeDeActivacion(
        new Error("La emisión productiva todavía no está habilitada."),
      ),
    ).toBe("Lo habilita el administrador del sistema.");
    expect(
      mensajeDeActivacion(
        new Error("Confirmá un punto exclusivo para esta sucursal."),
      ),
    ).toBe("Confirmá un punto exclusivo para esta sucursal.");
  });
});
