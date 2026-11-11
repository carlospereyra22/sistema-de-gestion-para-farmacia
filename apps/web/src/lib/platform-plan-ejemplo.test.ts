import { describe, expect, it } from "vitest";
import { abonoDeEjemplo } from "./platform-plan-ejemplo";

const plan = { includedUsers: 1, includedBranches: 1 };
const precios = {
  base: "30.000",
  extraUser: "5.000",
  extraBranch: "15.000,50",
};

describe("calculadora de abono en Planes", () => {
  it("suma el base y los extras de la farmacia elegida", () => {
    const abono = abonoDeEjemplo(plan, precios, { sucursales: 3, usuarios: 2 });
    expect(abono.filas).toEqual([
      ["Abono base", "3000000"],
      ["2 sucursales adicionales", "3000100"],
      ["1 usuario adicional", "500000"],
    ]);
    expect(abono.totalMinor).toBe("6500100");
  });

  it("no baja de lo que el plan incluye", () => {
    const abono = abonoDeEjemplo(plan, precios, { sucursales: 0, usuarios: 0 });
    expect(abono.sucursales).toBe(1);
    expect(abono.usuarios).toBe(1);
    expect(abono.totalMinor).toBe("3000000");
  });

  it("sin un importe válido no calcula", () => {
    const abono = abonoDeEjemplo(plan, { ...precios, base: "abc" });
    expect(abono.filas).toBeUndefined();
  });
});
