import { descuentoDeDespacho } from "./transferencia-sin-conexion";

describe("descuentoDeDespacho", () => {
  it("descuenta todo lo enviado si el lote alcanza", () => {
    expect(descuentoDeDespacho(10, 4)).toEqual({ descontar: 4, faltan: 0 });
  });
  it("deja el lote en cero y avisa lo que falta si no alcanza", () => {
    expect(descuentoDeDespacho(3, 5)).toEqual({ descontar: 3, faltan: 2 });
  });
  it("no descuenta nada de un lote vacío", () => {
    expect(descuentoDeDespacho(0, 2)).toEqual({ descontar: 0, faltan: 2 });
  });
});
