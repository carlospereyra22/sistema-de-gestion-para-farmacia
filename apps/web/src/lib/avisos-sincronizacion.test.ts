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

describe("avisos de caja sin conexión", () => {
  it("cierre con otro esperado muestra lo que vio la PC y lo del servidor", () => {
    const aviso = textoAviso({
      kind: "CIERRE_DISTINTO",
      detail: {
        caja: "Mostrador",
        vioMinor: "10000",
        esperadoMinor: "15000",
        contadoMinor: "10000",
      },
    });
    expect(aviso.titulo).toBe("Cierre para revisar: Mostrador");
    expect(aviso.detalle).toContain("150,00");
  });

  it("caja abierta por otra PC y movimiento fuera de caja", () => {
    expect(
      textoAviso({ kind: "CAJA_YA_ABIERTA", detail: { caja: "Mostrador" } })
        .detalle,
    ).toContain("Otra PC");
    expect(
      textoAviso({
        kind: "MOVIMIENTO_RETENIDO",
        detail: { tipo: "OUT", amountMinor: "5000", motivo: "Flete" },
      }).detalle,
    ).toContain("egreso");
  });
});

describe("aviso de apertura sin conexión (SISTEMA-103)", () => {
  it("explica cuántas cajas se abrieron", () => {
    expect(
      textoAviso({
        kind: "AJUSTE_SUPERA_STOCK",
        detail: {
          nombre: "Buscapina x100",
          lote: "L1",
          tipo: "APERTURA",
          pedido: 5,
          registrado: 3,
          faltan: 2,
        },
      }),
    ).toEqual({
      titulo: "Apertura mayor al stock: Buscapina x100 · lote L1",
      detalle:
        "Se pidió abrir 5 cajas y quedaban 3: se abrieron 3 y 2 no. Revisá el stock.",
    });
  });
});
