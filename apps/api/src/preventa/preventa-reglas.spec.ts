import {
  accionPermitida,
  comisionMinor,
  descuentoParaLaVenta,
  diaEnArgentina,
  diasValidos,
  estadoCobro,
  huellaPreventa,
  porcentajeABps,
  porcentajeDelPedido,
  precioParaLaVenta,
  repartoDelCobro,
  seVisitaEl,
  ubicacionValida,
  unirRenglonesPreventa,
} from "./preventa-reglas";

describe("estados del pedido de preventa", () => {
  it("un pedido pendiente se edita, se asigna, se entrega o se cancela", () => {
    expect(accionPermitida("PENDING", "editar")).toBe(true);
    expect(accionPermitida("PENDING", "asignar")).toBe(true);
    expect(accionPermitida("PENDING", "entregar")).toBe(true);
    expect(accionPermitida("PENDING", "cancelar")).toBe(true);
    expect(accionPermitida("PENDING", "noEntregado")).toBe(false);
    expect(accionPermitida("PENDING", "cobrar")).toBe(false);
  });

  it("en reparto ya no se edita, pero puede volver a pendiente", () => {
    expect(accionPermitida("IN_DELIVERY", "editar")).toBe(false);
    expect(accionPermitida("IN_DELIVERY", "noEntregado")).toBe(true);
    expect(accionPermitida("IN_DELIVERY", "quitarDelReparto")).toBe(true);
    expect(accionPermitida("IN_DELIVERY", "entregar")).toBe(true);
  });

  it("entregado sólo admite cobros y cancelado nada", () => {
    expect(accionPermitida("DELIVERED", "cobrar")).toBe(true);
    expect(accionPermitida("DELIVERED", "cancelar")).toBe(false);
    expect(accionPermitida("DELIVERED", "entregar")).toBe(false);
    for (const accion of ["editar", "entregar", "cobrar", "cancelar"] as const)
      expect(accionPermitida("CANCELLED", accion)).toBe(false);
  });
});

describe("cobro", () => {
  it("dice si está pagado, parcial o sin pago", () => {
    expect(estadoCobro(10_000n, 10_000n)).toBe("PAGADO");
    expect(estadoCobro(10_000n, 4_000n)).toBe("PARCIAL");
    expect(estadoCobro(10_000n, 0n)).toBe("SIN_PAGO");
    expect(estadoCobro(0n, 0n)).toBe("PAGADO");
  });

  it("nunca cobra más que el total: el vuelto no se registra", () => {
    expect(repartoDelCobro(10_000n, 15_000n)).toEqual({
      cobradoMinor: 10_000n,
      debeMinor: 0n,
    });
    expect(repartoDelCobro(10_000n, 2_500n)).toEqual({
      cobradoMinor: 2_500n,
      debeMinor: 7_500n,
    });
    expect(() => repartoDelCobro(10_000n, -1n)).toThrow();
  });
});

describe("comisiones", () => {
  it("calcula total × porcentaje redondeando al centavo", () => {
    expect(comisionMinor(100_000n, 250)).toBe(2_500n);
    // $333,33 al 1,5 % = $4,99995 → $5,00
    expect(comisionMinor(33_333n, 150)).toBe(500n);
    expect(comisionMinor(100_000n, 0)).toBe(0n);
  });

  it("el porcentaje del pedido gana sobre el del preventista, incluso 0", () => {
    expect(
      porcentajeDelPedido({ commissionRateBps: 0 }, { commissionRateBps: 300 }),
    ).toEqual({ rateBps: 0, origen: "PEDIDO" });
    expect(
      porcentajeDelPedido(
        { commissionRateBps: null },
        { commissionRateBps: 300 },
      ),
    ).toEqual({ rateBps: 300, origen: "PREVENTISTA" });
    expect(porcentajeDelPedido({ commissionRateBps: null }, null)).toEqual({
      rateBps: 0,
      origen: "SIN_PORCENTAJE",
    });
  });

  it("lee porcentajes escritos con coma o punto", () => {
    expect(porcentajeABps("2,5")).toBe(250);
    expect(porcentajeABps("10")).toBe(1000);
    expect(porcentajeABps("100")).toBe(10_000);
    expect(porcentajeABps("101")).toBeNull();
    expect(porcentajeABps("abc")).toBeNull();
    expect(porcentajeABps("1,234")).toBeNull();
  });
});

describe("pedido a venta", () => {
  it("respeta el precio del pedido salvo que la lista haya bajado", () => {
    expect(precioParaLaVenta(9_000n, 10_000n)).toBe(9_000n);
    expect(precioParaLaVenta(10_000n, 10_000n)).toBeUndefined();
    // La lista bajó a $8.000: se cobra la lista.
    expect(precioParaLaVenta(10_000n, 8_000n)).toBeUndefined();
  });

  it("el descuento no supera el subtotal", () => {
    expect(descuentoParaLaVenta(500n, 1_000n, 2)).toBe(500n);
    expect(descuentoParaLaVenta(5_000n, 1_000n, 2)).toBe(2_000n);
  });
});

describe("visitas y ubicación", () => {
  it("valida la máscara de días y responde por día", () => {
    const lunesYJueves = (1 << 1) | (1 << 4);
    expect(diasValidos(lunesYJueves)).toBe(true);
    expect(diasValidos(128)).toBe(false);
    expect(diasValidos(-1)).toBe(false);
    expect(seVisitaEl(lunesYJueves, 1)).toBe(true);
    expect(seVisitaEl(lunesYJueves, 2)).toBe(false);
  });

  it("toma el día en Argentina: las 01:00 UTC del martes son lunes", () => {
    expect(diaEnArgentina(new Date("2026-11-17T01:00:00Z"))).toBe(1);
    expect(diaEnArgentina(new Date("2026-11-17T12:00:00Z"))).toBe(2);
  });

  it("pide latitud y longitud juntas y dentro del rango", () => {
    expect(ubicacionValida(null, null)).toBe(true);
    expect(ubicacionValida(-34.6, -58.4)).toBe(true);
    expect(ubicacionValida(-34.6, null)).toBe(false);
    expect(ubicacionValida(-95, -58.4)).toBe(false);
  });
});

describe("renglones y huella", () => {
  it("junta productos repetidos", () => {
    expect(
      unirRenglonesPreventa([
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 2 },
        { productId: "a", quantity: 3, unitPriceMinor: "900" },
        { productId: "c", quantity: 0 },
      ]),
    ).toEqual([
      { productId: "a", quantity: 4, unitPriceMinor: "900" },
      { productId: "b", quantity: 2, unitPriceMinor: undefined },
    ]);
  });

  it("la huella no depende del orden pero sí del contenido", () => {
    const base = {
      customerId: "c",
      items: [
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 2 },
      ],
    };
    expect(huellaPreventa(base)).toBe(
      huellaPreventa({ ...base, items: [...base.items].reverse() }),
    );
    expect(huellaPreventa(base)).not.toBe(
      huellaPreventa({
        ...base,
        items: [{ productId: "a", quantity: 2 }, base.items[1]!],
      }),
    );
    expect(huellaPreventa(base)).not.toBe(
      huellaPreventa({ ...base, customerId: "otro" }),
    );
  });
});
