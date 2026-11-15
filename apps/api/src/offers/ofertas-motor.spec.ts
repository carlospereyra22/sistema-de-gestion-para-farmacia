import {
  aplicaEn,
  calcularOfertas,
  estadoOferta,
  etiquetaOferta,
  ofertaAJson,
  ofertaDesdeJson,
  productoEntra,
  type OfertaMotor,
  type RenglonMotor,
} from "./ofertas-motor";

// Martes 10/11/2026 10:30 de Argentina (13:30 UTC).
const MARTES = new Date("2026-11-10T13:30:00.000Z");
const contexto = { ahora: MARTES, branchId: "suc-1", priceListId: "lista-1" };

function oferta(parcial: Partial<OfertaMotor> = {}): OfertaMotor {
  return {
    id: "of-1",
    version: 1,
    name: "Oferta",
    type: "PERCENT",
    status: "PUBLISHED",
    priority: 0,
    combinable: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    startsAt: "2026-11-01T00:00:00.000Z",
    endsAt: null,
    weekdays: null,
    dayStartMinute: null,
    dayEndMinute: null,
    branchIds: null,
    priceListIds: null,
    productKind: "ALL",
    maxUnitsPerSale: null,
    remainingUnits: null,
    percentBps: 2000,
    amountMinor: null,
    fixedPriceMinor: null,
    buyQuantity: null,
    payQuantity: null,
    nthUnit: null,
    bundlePriceMinor: null,
    tiers: [],
    targets: [{ kind: "PRODUCT", id: "p1", exclude: false, quantity: null }],
    ...parcial,
  };
}

function renglon(
  productId: string,
  quantity: number,
  precio: number,
  parcial: Partial<RenglonMotor> = {},
): RenglonMotor {
  return {
    productId,
    quantity,
    unitPriceMinor: BigInt(precio),
    categoryId: null,
    laboratoryId: null,
    isMedication: false,
    manualPrice: false,
    ...parcial,
  };
}

const descuento = (
  resultado: ReturnType<typeof calcularOfertas>,
  productId: string,
) =>
  resultado.renglones.find((item) => item.productId === productId)
    ?.offerDiscountMinor;

describe("motor de ofertas: tipos", () => {
  it("porcentaje sobre el precio de lista, redondeado una vez por renglón", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 3, 999)],
      [oferta({ percentBps: 1250 })],
      contexto,
    );
    // 2997 × 12,5% = 374,625 → 375 (una sola vez, no 125 × 3 = 375 por casualidad)
    expect(descuento(resultado, "p1")).toBe(375n);
    expect(resultado.aplicaciones[0]).toMatchObject({
      label: "-12,5%",
      units: 3,
      discountMinor: 375n,
    });
  });

  it("monto fijo por unidad sin bajar de cero", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 2, 30000)],
      [oferta({ type: "AMOUNT_OFF", percentBps: null, amountMinor: 50000n })],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(60000n);
  });

  it("precio fijo: el producto pasa a costar ese importe; si es más caro no aplica", () => {
    const fijo = oferta({
      type: "FIXED_PRICE",
      percentBps: null,
      fixedPriceMinor: 800000n,
    });
    expect(
      descuento(
        calcularOfertas([renglon("p1", 2, 1000000)], [fijo], contexto),
        "p1",
      ),
    ).toBe(400000n);
    expect(
      calcularOfertas([renglon("p1", 2, 700000)], [fijo], contexto).totalMinor,
    ).toBe(0n);
  });

  it("2x1: con 3 unidades regala una sola", () => {
    const dosPorUno = oferta({
      type: "BUY_X_PAY_Y",
      percentBps: null,
      buyQuantity: 2,
      payQuantity: 1,
    });
    const resultado = calcularOfertas(
      [renglon("p1", 3, 1000)],
      [dosPorUno],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(1000n);
    expect(resultado.aplicaciones[0]).toMatchObject({ label: "2x1", units: 2 });
  });

  it("3x2 con precios distintos: regala la más barata de cada grupo", () => {
    const tresPorDos = oferta({
      type: "BUY_X_PAY_Y",
      percentBps: null,
      buyQuantity: 3,
      payQuantity: 2,
      targets: [
        { kind: "LABORATORY", id: "lab-x", exclude: false, quantity: null },
      ],
    });
    const lab = { laboratoryId: "lab-x" };
    const resultado = calcularOfertas(
      [
        renglon("caro", 2, 5000, lab),
        renglon("medio", 2, 3000, lab),
        renglon("barato", 2, 1000, lab),
      ],
      [tresPorDos],
      contexto,
    );
    // Grupos: [5000, 5000, 3000] regala 3000 y [3000, 1000, 1000] regala 1000.
    expect(descuento(resultado, "caro")).toBe(0n);
    expect(descuento(resultado, "medio")).toBe(3000n);
    expect(descuento(resultado, "barato")).toBe(1000n);
    expect(resultado.aplicaciones[0]?.units).toBe(6);
  });

  it("cantidades que no completan el grupo: sin descuento y con sugerencia", () => {
    const tresPorDos = oferta({
      type: "BUY_X_PAY_Y",
      percentBps: null,
      buyQuantity: 3,
      payQuantity: 2,
    });
    const resultado = calcularOfertas(
      [renglon("p1", 2, 1000)],
      [tresPorDos],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0n);
    expect(resultado.sugerencias).toEqual([
      expect.objectContaining({
        mensaje: "Agregá 1 más y llevás 3x2",
        faltan: 1,
      }),
    ]);
  });

  it("segunda unidad al 50%", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 3, 1001)],
      [
        oferta({
          type: "NTH_UNIT_PERCENT",
          nthUnit: 2,
          percentBps: 5000,
        }),
      ],
      contexto,
    );
    // Un grupo de 2: la segunda a mitad de precio → 500,5 → 501.
    expect(descuento(resultado, "p1")).toBe(501n);
    expect(resultado.aplicaciones[0]?.label).toBe("2da al 50%");
  });

  it("escalonada: toma el escalón más alto alcanzado y sugiere el siguiente", () => {
    const escalonada = oferta({
      type: "TIERED",
      percentBps: null,
      tiers: [
        { minQuantity: 3, percentBps: 1500, amountMinor: null },
        { minQuantity: 6, percentBps: 2000, amountMinor: null },
      ],
    });
    const cuatro = calcularOfertas(
      [renglon("p1", 4, 1000)],
      [escalonada],
      contexto,
    );
    expect(descuento(cuatro, "p1")).toBe(600n);
    expect(cuatro.sugerencias[0]?.faltan).toBe(2);
    expect(
      descuento(
        calcularOfertas([renglon("p1", 6, 1000)], [escalonada], contexto),
        "p1",
      ),
    ).toBe(1200n);
    expect(
      calcularOfertas([renglon("p1", 2, 1000)], [escalonada], contexto)
        .totalMinor,
    ).toBe(0n);
  });

  it("combo a precio fijo, repartido entre renglones con el remanente al último", () => {
    const combo = oferta({
      type: "BUNDLE",
      percentBps: null,
      bundlePriceMinor: 1000n,
      targets: [
        { kind: "PRODUCT", id: "shampoo", exclude: false, quantity: 1 },
        { kind: "PRODUCT", id: "crema", exclude: false, quantity: 2 },
      ],
    });
    const resultado = calcularOfertas(
      [renglon("shampoo", 1, 700), renglon("crema", 3, 300)],
      [combo],
      contexto,
    );
    // Combo: 700 + 2 × 300 = 1300 → 1000: ahorro 300, proporcional 700/1300.
    expect(descuento(resultado, "shampoo")).toBe(162n);
    expect(descuento(resultado, "crema")).toBe(138n);
    expect(resultado.totalMinor).toBe(300n);
    expect(resultado.aplicaciones[0]?.units).toBe(3);
  });

  it("combo incompleto: no aplica y avisa si falta una unidad", () => {
    const combo = oferta({
      type: "BUNDLE",
      percentBps: 1000,
      targets: [
        { kind: "PRODUCT", id: "a", exclude: false, quantity: 1 },
        { kind: "PRODUCT", id: "b", exclude: false, quantity: 1 },
      ],
    });
    const resultado = calcularOfertas(
      [renglon("a", 1, 1000)],
      [combo],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0n);
    expect(resultado.sugerencias[0]?.faltan).toBe(1);
  });
});

describe("motor de ofertas: topes, combinación y precio", () => {
  it("tope por venta: descuenta las unidades más caras hasta el tope", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 5, 1000)],
      [oferta({ percentBps: 1000, maxUnitsPerSale: 2 })],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(200n);
    expect(resultado.aplicaciones[0]?.units).toBe(2);
  });

  it("tope total agotado: no aplica", () => {
    expect(
      calcularOfertas(
        [renglon("p1", 1, 1000)],
        [oferta({ remainingUnits: 0 })],
        contexto,
      ).totalMinor,
    ).toBe(0n);
  });

  it("no combinables: el renglón recibe la de mayor ahorro", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 2, 1000)],
      [
        oferta({ id: "diez", percentBps: 1000, priority: 5 }),
        oferta({
          id: "dos-por-uno",
          type: "BUY_X_PAY_Y",
          percentBps: null,
          buyQuantity: 2,
          payQuantity: 1,
        }),
      ],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(1000n);
    expect(resultado.aplicaciones.map((item) => item.offerId)).toEqual([
      "dos-por-uno",
    ]);
  });

  it("a igual ahorro gana la de mayor prioridad", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000)],
      [
        oferta({ id: "baja", percentBps: 1000, priority: 1 }),
        oferta({ id: "alta", percentBps: 1000, priority: 9 }),
      ],
      contexto,
    );
    expect(resultado.aplicaciones.map((item) => item.offerId)).toEqual([
      "alta",
    ]);
  });

  it("combinables: se suman sobre el precio ya ofertado", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 10000)],
      [
        oferta({ id: "veinte", percentBps: 2000, combinable: true }),
        oferta({ id: "diez", percentBps: 1000, combinable: true }),
      ],
      contexto,
    );
    // 10000 − 20% = 8000; − 10% de 8000 = 7200.
    expect(descuento(resultado, "p1")).toBe(2800n);
    expect(resultado.renglones[0]?.labels).toEqual(["-20%", "-10%"]);
  });

  it("una combinable no se suma a una que no lo es", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 10000)],
      [
        oferta({ id: "veinte", percentBps: 2000 }),
        oferta({ id: "diez", percentBps: 1000, combinable: true }),
      ],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(2000n);
  });

  it("el precio manual de la cajera reemplaza la oferta", () => {
    expect(
      calcularOfertas(
        [renglon("p1", 1, 1000, { manualPrice: true })],
        [oferta()],
        contexto,
      ).totalMinor,
    ).toBe(0n);
  });

  it("se calcula sobre el precio de lista que llega (el de la lista del cliente)", () => {
    expect(
      descuento(
        calcularOfertas([renglon("p1", 1, 750)], [oferta()], contexto),
        "p1",
      ),
    ).toBe(150n);
  });

  it("nunca deja un renglón por debajo de cero", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000)],
      [
        oferta({ id: "a", percentBps: 10000, combinable: true }),
        oferta({
          id: "b",
          type: "AMOUNT_OFF",
          percentBps: null,
          amountMinor: 500n,
          combinable: true,
        }),
      ],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(1000n);
  });
});

describe("motor de ofertas: alcance y vigencia", () => {
  const martes = 1 << 2;

  it("estado calculado con la fecha, sin tocar la base", () => {
    expect(estadoOferta(oferta({ status: "DRAFT" }), MARTES)).toBe("BORRADOR");
    expect(
      estadoOferta(oferta({ startsAt: "2026-12-01T03:00:00.000Z" }), MARTES),
    ).toBe("PROGRAMADA");
    expect(
      estadoOferta(oferta({ endsAt: "2026-11-10T13:00:00.000Z" }), MARTES),
    ).toBe("VENCIDA");
    expect(estadoOferta(oferta(), MARTES)).toBe("ACTIVA");
    expect(estadoOferta(oferta({ status: "PAUSED" }), MARTES)).toBe("PAUSADA");
  });

  it("día de la semana y franja horaria en hora de Argentina", () => {
    expect(aplicaEn(oferta({ weekdays: martes }), contexto)).toBe(true);
    expect(aplicaEn(oferta({ weekdays: 1 << 4 }), contexto)).toBe(false);
    expect(
      aplicaEn(
        oferta({ dayStartMinute: 9 * 60, dayEndMinute: 12 * 60 }),
        contexto,
      ),
    ).toBe(true);
    expect(
      aplicaEn(
        oferta({ dayStartMinute: 11 * 60, dayEndMinute: 12 * 60 }),
        contexto,
      ),
    ).toBe(false);
    // Martes 23:30 de Argentina ya es miércoles en UTC.
    expect(
      aplicaEn(oferta({ weekdays: martes }), {
        ...contexto,
        ahora: new Date("2026-11-11T02:30:00.000Z"),
      }),
    ).toBe(true);
  });

  it("sucursal y lista de precios fuera de alcance", () => {
    expect(aplicaEn(oferta({ branchIds: ["suc-2"] }), contexto)).toBe(false);
    expect(aplicaEn(oferta({ branchIds: ["suc-1"] }), contexto)).toBe(true);
    expect(aplicaEn(oferta({ priceListIds: ["lista-9"] }), contexto)).toBe(
      false,
    );
  });

  it("categoría con subcategorías, exclusiones y tipo de producto", () => {
    const porCategoria = oferta({
      targets: [
        {
          kind: "CATEGORY",
          id: "solares",
          exclude: false,
          quantity: null,
          categoryIds: ["solares", "solares-niños"],
        },
        { kind: "PRODUCT", id: "excluido", exclude: true, quantity: null },
      ],
    });
    const base = {
      categoryId: "solares-niños",
      laboratoryId: null,
      isMedication: false,
    };
    expect(productoEntra(porCategoria, { ...base, productId: "x" })).toBe(true);
    expect(
      productoEntra(porCategoria, { ...base, productId: "excluido" }),
    ).toBe(false);
    expect(
      productoEntra(
        { ...porCategoria, productKind: "MEDICATION" },
        { ...base, productId: "x" },
      ),
    ).toBe(false);
  });

  it("los medicamentos con receta pueden tener oferta", () => {
    expect(
      calcularOfertas(
        [renglon("p1", 1, 1000, { isMedication: true })],
        [oferta()],
        contexto,
      ).totalMinor,
    ).toBe(200n);
  });

  it("no aplica fuera de vigencia", () => {
    expect(
      calcularOfertas(
        [renglon("p1", 1, 1000)],
        [oferta({ endsAt: "2026-11-09T00:00:00.000Z" })],
        contexto,
      ).totalMinor,
    ).toBe(0n);
  });
});

describe("motor de ofertas: etiquetas y JSON", () => {
  it("etiquetas cortas", () => {
    expect(etiquetaOferta(oferta({ weekdays: 1 << 2, percentBps: 1000 }))).toBe(
      "Martes -10%",
    );
    expect(
      etiquetaOferta(
        oferta({ type: "AMOUNT_OFF", percentBps: null, amountMinor: 150000n }),
      ),
    ).toBe("-$1.500");
    expect(
      etiquetaOferta(
        oferta({ type: "NTH_UNIT_PERCENT", nthUnit: 2, percentBps: 7000 }),
      ),
    ).toBe("2da al 70%");
  });

  it("ida y vuelta por JSON sin perder importes", () => {
    const original = oferta({
      type: "TIERED",
      percentBps: null,
      tiers: [{ minQuantity: 3, percentBps: null, amountMinor: 12345n }],
    });
    expect(ofertaDesdeJson(ofertaAJson(original))).toEqual(original);
  });
});

describe("motor de ofertas: por medio de pago", () => {
  const efectivo = oferta({
    id: "of-pago",
    type: "PAYMENT_METHOD",
    percentBps: 1000,
    paymentMethods: ["CASH"],
    targets: [
      { kind: "PRODUCT", id: "p1", exclude: false, quantity: null },
      { kind: "PRODUCT", id: "p2", exclude: false, quantity: null },
    ],
  });
  const cobro = (
    pagos: { method: "CASH" | "CARD" | "TRANSFER"; amountMinor: number }[],
    otrosMinor = 0,
  ) => ({
    ...contexto,
    cobro: {
      pagos: pagos.map((pago) => ({
        method: pago.method,
        amountMinor: BigInt(pago.amountMinor),
      })),
      otrosMinor: BigInt(otrosMinor),
    },
  });

  it("sin pagos no descuenta: sugiere el ahorro pagando con ese medio", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [efectivo],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0n);
    expect(resultado.sugerencias[0]).toMatchObject({
      faltan: 0,
      mensaje: "Pagando con efectivo: $1.000 menos",
      medioDePago: { medios: ["CASH"], ahorroMinor: 100000n },
    });
  });

  it("todo en efectivo: el porcentaje completo", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [efectivo],
      cobro([{ method: "CASH", amountMinor: 900000 }]),
    );
    expect(resultado.totalMinor).toBe(100000n);
    expect(resultado.aplicaciones[0]?.type).toBe("PAYMENT_METHOD");
  });

  it("todo con tarjeta: nada", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [efectivo],
      cobro([{ method: "CARD", amountMinor: 1000000 }]),
    );
    expect(resultado.totalMinor).toBe(0n);
    expect(resultado.aplicaciones).toEqual([]);
  });

  it("pago mixto: proporcional a la parte que cubre el efectivo", () => {
    // $10.000: $4.000 con tarjeta; el efectivo cubre $6.000 → $600 menos.
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [efectivo],
      cobro([
        { method: "CARD", amountMinor: 400000 },
        { method: "CASH", amountMinor: 540000 },
      ]),
    );
    expect(resultado.totalMinor).toBe(60000n);
  });

  it("el vuelto del efectivo no cambia el descuento", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [efectivo],
      cobro([{ method: "CASH", amountMinor: 2000000 }]),
    );
    expect(resultado.totalMinor).toBe(100000n);
  });

  it("descuento por transferencia con resto en efectivo (con vuelto)", () => {
    const transferencia = oferta({
      ...efectivo,
      paymentMethods: ["TRANSFER"],
    });
    // Transferencia de $5.400 cubre $6.000 del ticket → $600 menos; el resto
    // ($4.000) en efectivo con un billete de $5.000.
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [transferencia],
      cobro([
        { method: "TRANSFER", amountMinor: 540000 },
        { method: "CASH", amountMinor: 500000 },
      ]),
    );
    expect(resultado.totalMinor).toBe(60000n);
  });

  it("sólo sobre los productos de la oferta, con el total de toda la venta", () => {
    // p1 $6.000 en la oferta, p3 $4.000 fuera. Todo en efectivo: 10% de $6.000.
    const resultado = calcularOfertas(
      [renglon("p1", 1, 600000), renglon("p3", 1, 400000)],
      [efectivo],
      cobro([{ method: "CASH", amountMinor: 940000 }]),
    );
    expect(descuento(resultado, "p1")).toBe(60000n);
    expect(descuento(resultado, "p3")).toBe(0n);
  });

  it("respeta combinable: no se suma a otra oferta no combinable", () => {
    const dosPorUno = oferta({
      id: "of-2x1",
      type: "BUY_X_PAY_Y",
      percentBps: null,
      buyQuantity: 2,
      payQuantity: 1,
    });
    const pagos = [{ method: "CASH" as const, amountMinor: 100000 }];
    const sinCombinar = calcularOfertas(
      [renglon("p1", 2, 100000)],
      [dosPorUno, efectivo],
      cobro(pagos),
    );
    expect(sinCombinar.totalMinor).toBe(100000n);
    const combinadas = calcularOfertas(
      [renglon("p1", 2, 100000)],
      [
        { ...dosPorUno, combinable: true },
        { ...efectivo, combinable: true },
      ],
      cobro(pagos),
    );
    // 2x1 deja $1.000; 10% en efectivo sobre eso.
    expect(combinadas.totalMinor).toBe(110000n);
  });

  it("dos ofertas por medio de pago no se suman: va la de mayor ahorro", () => {
    const transferencia = oferta({
      ...efectivo,
      id: "of-transf",
      percentBps: 500,
      paymentMethods: ["TRANSFER"],
      combinable: true,
    });
    const resultado = calcularOfertas(
      [renglon("p1", 1, 1000000)],
      [{ ...efectivo, combinable: true }, transferencia],
      cobro([
        { method: "TRANSFER", amountMinor: 500000 },
        { method: "CASH", amountMinor: 500000 },
      ]),
    );
    expect(resultado.aplicaciones).toHaveLength(1);
    expect(resultado.aplicaciones[0]?.offerId).toBe("of-pago");
  });

  it("etiqueta con los medios", () => {
    expect(
      etiquetaOferta({
        ...efectivo,
        weekdays: 1 << 2,
        paymentMethods: ["CASH", "TRANSFER"],
      }),
    ).toBe("Martes -10% efectivo o transferencia");
  });
});

describe("motor de ofertas: todos los productos", () => {
  it("entra cualquier producto salvo los excluidos y respeta el tipo", () => {
    const todos = oferta({
      allProducts: true,
      productKind: "NON_MEDICATION",
      targets: [{ kind: "PRODUCT", id: "p2", exclude: true, quantity: null }],
    });
    const producto = (productId: string, isMedication = false) => ({
      productId,
      categoryId: null,
      laboratoryId: null,
      isMedication,
    });
    expect(productoEntra(todos, producto("cualquiera"))).toBe(true);
    expect(productoEntra(todos, producto("p2"))).toBe(false);
    expect(productoEntra(todos, producto("remedio", true))).toBe(false);
  });
});

describe("motor de ofertas: por monto de compra", () => {
  const desde = (parcial: Partial<OfertaMotor> = {}) =>
    oferta({
      id: "of-monto",
      type: "SPEND_THRESHOLD",
      percentBps: 1000,
      minPurchaseMinor: 10000000n,
      allProducts: true,
      targets: [],
      ...parcial,
    });

  it("llegando al mínimo: el porcentaje sobre todo lo que entra", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 6000000), renglon("p2", 1, 4000000)],
      [desde({ minPurchaseMinor: 10000000n })],
      contexto,
    );
    expect(resultado.totalMinor).toBe(1000000n);
    expect(descuento(resultado, "p1")).toBe(600000n);
    expect(descuento(resultado, "p2")).toBe(400000n);
  });

  it("en pesos: una vez por venta, repartido", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 3, 4000000)],
      [
        desde({
          minPurchaseMinor: 10000000n,
          percentBps: null,
          amountMinor: 500000n,
        }),
      ],
      contexto,
    );
    expect(resultado.totalMinor).toBe(500000n);
  });

  it("sin llegar no descuenta; si falta poco, sugiere cuánto sumar", () => {
    const resultado = calcularOfertas(
      [renglon("p1", 1, 9200000)],
      [desde({ minPurchaseMinor: 10000000n })],
      contexto,
    );
    expect(resultado.totalMinor).toBe(0n);
    expect(resultado.sugerencias[0]).toMatchObject({
      mensaje: "Sumá $8.000 más y llevás Desde $100.000 -10%",
      porMonto: { faltaMinor: 800000n },
    });
    const lejos = calcularOfertas(
      [renglon("p1", 1, 2000000)],
      [desde({ minPurchaseMinor: 10000000n })],
      contexto,
    );
    expect(lejos.sugerencias).toEqual([]);
  });

  it("«No aplicar» en un producto: suma para el mínimo, pero no recibe descuento", () => {
    // $60.000 + $45.000 = $105.000 llega; p2 marcado sin oferta.
    const resultado = calcularOfertas(
      [
        renglon("p1", 1, 6000000),
        renglon("p2", 1, 4500000, { sinOfertas: true }),
      ],
      [desde({ minPurchaseMinor: 10000000n })],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(600000n);
    expect(descuento(resultado, "p2")).toBe(0n);
  });

  it("el mínimo se mide después de las otras ofertas", () => {
    const dosPorUno = oferta({
      id: "of-2x1",
      type: "BUY_X_PAY_Y",
      percentBps: null,
      buyQuantity: 2,
      payQuantity: 1,
      combinable: true,
    });
    // 2 × $60.000 con 2x1 = $60.000: no llega a $100.000.
    const resultado = calcularOfertas(
      [renglon("p1", 2, 6000000)],
      [dosPorUno, desde({ minPurchaseMinor: 10000000n, combinable: true })],
      contexto,
    );
    expect(resultado.totalMinor).toBe(6000000n);
  });

  it("etiqueta y JSON", () => {
    const original = desde({ minPurchaseMinor: 10000000n });
    expect(etiquetaOferta(original)).toBe("Desde $100.000 -10%");
    expect(ofertaDesdeJson(ofertaAJson(original))).toEqual(original);
  });
});

describe("motor de ofertas: no aplicar en un producto", () => {
  it("un renglón marcado sin ofertas no recibe ninguna, los demás sí", () => {
    const resultado = calcularOfertas(
      [
        renglon("p1", 1, 100000, { sinOfertas: true }),
        renglon("p2", 1, 100000),
      ],
      [
        oferta({
          targets: [
            { kind: "PRODUCT", id: "p1", exclude: false, quantity: null },
            { kind: "PRODUCT", id: "p2", exclude: false, quantity: null },
          ],
        }),
      ],
      contexto,
    );
    expect(descuento(resultado, "p1")).toBe(0n);
    expect(descuento(resultado, "p2")).toBe(20000n);
  });
});

describe("motor de ofertas: no combinables, gana la mejor", () => {
  const pagoEfectivo = (amountMinor: number) => ({
    ...contexto,
    cobro: {
      pagos: [{ method: "CASH" as const, amountMinor: BigInt(amountMinor) }],
      otrosMinor: 0n,
    },
  });
  const efectivo15 = oferta({
    id: "of-efectivo",
    type: "PAYMENT_METHOD",
    percentBps: 1500,
    paymentMethods: ["CASH"],
    allProducts: true,
    targets: [],
  });

  it("10% por monto contra 15% en efectivo: gana el 15%", () => {
    const porMonto = oferta({
      id: "of-100k",
      type: "SPEND_THRESHOLD",
      percentBps: 1000,
      minPurchaseMinor: 10000000n,
      allProducts: true,
      targets: [],
    });
    const resultado = calcularOfertas(
      [renglon("p1", 1, 6000000), renglon("p2", 1, 5000000)],
      [porMonto, efectivo15],
      pagoEfectivo(9350000),
    );
    // 15% de $110.000.
    expect(resultado.totalMinor).toBe(1650000n);
    expect(resultado.aplicaciones.map((item) => item.offerId)).toEqual([
      "of-efectivo",
    ]);
  });

  it("20% por cantidad en un producto y 15% en efectivo en el resto: se queda así", () => {
    const porCantidad = oferta({
      id: "of-cantidad",
      type: "TIERED",
      percentBps: null,
      tiers: [{ minQuantity: 3, percentBps: 2000, amountMinor: null }],
    });
    const resultado = calcularOfertas(
      [renglon("p1", 3, 1000000), renglon("p2", 1, 2000000)],
      [porCantidad, efectivo15],
      pagoEfectivo(4100000),
    );
    // p1: 20% de $30.000 = $6.000; p2: 15% de $20.000 = $3.000.
    expect(descuento(resultado, "p1")).toBe(600000n);
    expect(descuento(resultado, "p2")).toBe(300000n);
  });
});
