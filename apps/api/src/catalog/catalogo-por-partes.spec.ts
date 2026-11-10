import {
  parteDe,
  partesPedidas,
  rangoDeParte,
  versionesDePartes,
} from "./catalogo-por-partes";

describe("catálogo por partes", () => {
  it("la parte son los dos primeros caracteres del id", () => {
    expect(parteDe("AB12cd34-0000-4000-8000-000000000000")).toBe("ab");
  });

  it("el rango de una parte cubre todos sus ids", () => {
    const rango = rangoDeParte("7f");
    const id = "7f9a1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b";
    expect(id >= rango.gte && id <= rango.lte).toBe(true);
    expect("80000000-0000-0000-0000-000000000000" > rango.lte).toBe(true);
    expect(() => rangoDeParte("zz")).toThrow();
  });

  it("lee las partes pedidas sin repetidos y rechaza las inválidas", () => {
    expect(partesPedidas("0a, 1f,0a")).toEqual(["0a", "1f"]);
    expect(() => partesPedidas("0a,xyz")).toThrow();
    expect(() => partesPedidas("")).toThrow();
  });

  it("la versión cambia sólo en la parte que cambió", () => {
    const base = {
      productos: [
        { parte: "0a", huella: "p1" },
        { parte: "1f", huella: "p2" },
      ],
      codigos: [{ parte: "0a", huella: "c1" }],
      precios: [],
      estados: [],
      fotos: [],
    };
    const antes = versionesDePartes(base, "general");
    const despues = versionesDePartes(
      { ...base, codigos: [{ parte: "0a", huella: "c2" }] },
      "general",
    );
    expect(Object.keys(antes)).toEqual(["0a", "1f"]);
    expect(despues["0a"]).not.toBe(antes["0a"]);
    expect(despues["1f"]).toBe(antes["1f"]);
    // Cambiar la lista de precio general cambia todas.
    const otraLista = versionesDePartes(base, "otra");
    expect(otraLista["1f"]).not.toBe(antes["1f"]);
  });
});
