import { describe, expect, it } from "vitest";
import { textoAviso } from "./avisos-sincronizacion";

describe("textos de avisos a revisar", () => {
  it("precio distinto muestra lo cobrado y lo del sistema", () => {
    const aviso = textoAviso({
      kind: "PRECIO_DISTINTO",
      detail: {
        nombre: "Aspirina",
        cobradoMinor: "15669200",
        actualMinor: "15669300",
      },
    });
    expect(aviso.titulo).toBe("Precio distinto: Aspirina");
    expect(aviso.detalle).toContain("156.692,00");
    expect(aviso.detalle).toContain("156.693,00");
  });

  it("stock faltante dice cuántas no estaban", () => {
    expect(
      textoAviso({
        kind: "STOCK_FALTANTE",
        detail: { nombre: "Aspirina", vendidas: 2, faltantes: 1 },
      }).detalle,
    ).toContain("Se vendieron 2 y 1 no estaban");
  });

  it("caja cerrada indica dónde asignar el cobro", () => {
    expect(textoAviso({ kind: "CAJA_CERRADA", detail: {} }).detalle).toContain(
      "Caja",
    );
  });

  it("un tipo desconocido no rompe", () => {
    expect(textoAviso({ kind: "OTRO", detail: {} }).titulo).toBe(
      "Venta sin conexión para revisar",
    );
  });
});
