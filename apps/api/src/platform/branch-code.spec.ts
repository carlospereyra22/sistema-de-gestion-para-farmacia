import { uniqueBranchCode } from "./branch-code";

const none = new Set<string>();

describe("uniqueBranchCode", () => {
  it.each([
    ["Sucursal Córdoba", "SUCURSAL-CORDOBA"],
    ["  Nueva   Córdoba 2 ", "NUEVA-CORDOBA-2"],
    ["Peñón & Río", "PENON-RIO"],
  ])("%s", (name, code) => {
    expect(uniqueBranchCode(name, none)).toBe(code);
  });

  it("agrega un número si el código ya existe", () => {
    expect(uniqueBranchCode("Norte", new Set(["NORTE"]))).toBe("NORTE-2");
    expect(uniqueBranchCode("Norte", new Set(["NORTE", "NORTE-2"]))).toBe(
      "NORTE-3",
    );
  });

  it("nunca pasa de 32 caracteres, ni con el número", () => {
    const name = "A".repeat(40);
    const first = uniqueBranchCode(name, none);

    const second = uniqueBranchCode(name, new Set([first]));

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(second.endsWith("-2")).toBe(true);
  });

  it("no deja un guion antes del número al recortar", () => {
    const name = `${"A".repeat(29)} ${"B".repeat(10)}`;
    const first = uniqueBranchCode(name, none);

    expect(uniqueBranchCode(name, new Set([first]))).not.toContain("--");
  });

  it.each(["---", "1", "¿?"])(
    "con un nombre que no da un código válido (%s) usa uno genérico",
    (name) => {
      expect(uniqueBranchCode(name, none)).toBe("SUCURSAL");
    },
  );

  it("el resultado siempre cumple el formato de la base", () => {
    for (const name of ["Norte", "---", "Ñandú 1", "A".repeat(50)])
      expect(uniqueBranchCode(name, new Set(["NORTE"]))).toMatch(
        /^[A-Z0-9-]{2,32}$/,
      );
  });
});
