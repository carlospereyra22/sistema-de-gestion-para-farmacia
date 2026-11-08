import {
  DIAS_PARA_FACTURAR,
  estadoInicial,
  fueraDePlazo,
  leyendaComprobante,
} from "./factura-diferida";

describe("factura diferida", () => {
  const venta = new Date("2026-11-01T15:00:00.000Z");
  const dias = (n: number) =>
    new Date(venta.getTime() + n * 24 * 60 * 60 * 1000);

  it("permite mandar a ARCA hasta 30 días después de la venta", () => {
    expect(fueraDePlazo(venta, dias(0))).toBeNull();
    expect(fueraDePlazo(venta, dias(DIAS_PARA_FACTURAR))).toBeNull();
  });

  it("después de 30 días ya no se puede", () => {
    expect(
      fueraDePlazo(venta, new Date(dias(DIAS_PARA_FACTURAR).getTime() + 1)),
    ).toContain("más de 30 días");
  });

  it("el comprobante interno aclara que no es factura", () => {
    expect(leyendaComprobante({ factura: false, venta })).toBe(
      "COMPROBANTE INTERNO · NO VÁLIDO COMO FACTURA",
    );
  });

  it("la factura en espera avisa que todavía no salió", () => {
    expect(
      leyendaComprobante({
        factura: true,
        estado: "HELD",
        motivo: "CAJA_CERRADA",
        venta,
      }),
    ).toContain("se emite cuando el cobro entre a una caja");
  });

  it("la factura diferida dice cuándo fue la venta, en hora argentina", () => {
    expect(
      leyendaComprobante({
        factura: true,
        estado: "AUTHORIZED",
        motivo: "COMPROBANTE_INTERNO",
        venta,
      }),
    ).toBe("Facturada después · venta del 01/11/2026 12:00");
    expect(
      leyendaComprobante({ factura: true, estado: "AUTHORIZED", venta }),
    ).toBeUndefined();
  });

  it("la factura espera sólo si el cobro no entró a una caja", () => {
    expect(estadoInicial()).toBe("QUEUED");
    expect(
      estadoInicial({ motivo: "COMPROBANTE_INTERNO", enEspera: false }),
    ).toBe("QUEUED");
    expect(estadoInicial({ motivo: "CAJA_CERRADA", enEspera: true })).toBe(
      "HELD",
    );
  });
});
