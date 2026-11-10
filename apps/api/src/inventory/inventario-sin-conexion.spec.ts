import { camposDelLote, hastaLoQueHay } from "./inventario-sin-conexion";

describe("inventario sin conexión (SISTEMA-79)", () => {
  it("una salida se registra hasta lo que hay, nunca en negativo", () => {
    expect(hastaLoQueHay(5, 10)).toEqual({ registrado: 5, falta: 0 });
    expect(hastaLoQueHay(5, 3)).toEqual({ registrado: 3, falta: 2 });
    expect(hastaLoQueHay(5, 0)).toEqual({ registrado: 0, falta: 5 });
    expect(hastaLoQueHay(5, -2)).toEqual({ registrado: 0, falta: 5 });
  });

  it("sólo cuenta los datos del lote que se cambiaron", () => {
    expect(camposDelLote({ number: "L2" })).toEqual(["number"]);
    expect(camposDelLote({ expiresAt: null, unitCostMinor: "10" })).toEqual([
      "expiresAt",
      "unitCostMinor",
    ]);
    expect(camposDelLote({})).toEqual([]);
  });
});
