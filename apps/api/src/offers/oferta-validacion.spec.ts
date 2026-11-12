import { validarOferta, type OfertaEntrada } from "./oferta-validacion";

const base: OfertaEntrada = {
  name: "  Martes   10% ",
  type: "PERCENT",
  percentBps: 1000,
  startsAt: "2026-11-10T03:00:00.000Z",
  targets: [{ kind: "PRODUCT", id: "p1" }],
};

describe("validarOferta", () => {
  it("normaliza el nombre y deja en nulo los parámetros de otros tipos", () => {
    const resultado = validarOferta({ ...base, amountMinor: "500" });
    expect(resultado.datos).toMatchObject({
      name: "Martes 10%",
      percentBps: 1000,
      amountMinor: null,
      allBranches: true,
      allPriceLists: true,
      productKind: "ALL",
    });
  });

  it("rechaza fin anterior al inicio y franja incompleta", () => {
    expect(() =>
      validarOferta({ ...base, endsAt: "2026-11-09T00:00:00.000Z" }),
    ).toThrow("posterior al inicio");
    expect(() => validarOferta({ ...base, dayStartMinute: 540 })).toThrow(
      "Completá el horario",
    );
  });

  it("por medio de pago: porcentaje, al menos un medio y sin topes", () => {
    const medio = { ...base, type: "PAYMENT_METHOD" as const };
    expect(
      validarOferta({ ...medio, paymentMethods: ["CASH", "CASH"] }).datos,
    ).toMatchObject({ percentBps: 1000, paymentMethods: ["CASH"] });
    expect(() => validarOferta(medio)).toThrow("al menos un medio de pago");
    expect(() =>
      validarOferta({ ...medio, paymentMethods: ["CASH"], maxUnitsTotal: 10 }),
    ).toThrow("no llevan tope");
    // Los demás tipos no guardan medios de pago.
    expect(
      validarOferta({ ...base, paymentMethods: ["CASH"] }).datos.paymentMethods,
    ).toEqual([]);
  });

  it("todos los productos: sin elegir nada, lo elegido sólo excluye", () => {
    expect(
      validarOferta({ ...base, allProducts: true, targets: [] }).datos
        .allProducts,
    ).toBe(true);
    expect(() => validarOferta({ ...base, allProducts: true })).toThrow(
      "queda excluido",
    );
    expect(() =>
      validarOferta({
        ...base,
        type: "BUNDLE",
        percentBps: null,
        bundlePriceMinor: "1000",
        allProducts: true,
        targets: [],
      }),
    ).toThrow("no con todos");
  });

  it("por monto de compra: mínimo y un % o un monto, no los dos", () => {
    const monto = {
      ...base,
      type: "SPEND_THRESHOLD" as const,
      minPurchaseMinor: "10000000",
    };
    expect(validarOferta(monto).datos).toMatchObject({
      minPurchaseMinor: 10000000n,
      percentBps: 1000,
      amountMinor: null,
    });
    expect(() => validarOferta({ ...monto, amountMinor: "500" })).toThrow(
      "no los dos",
    );
    expect(() => validarOferta({ ...monto, minPurchaseMinor: null })).toThrow(
      "desde qué monto",
    );
    expect(validarOferta(base).datos.minPurchaseMinor).toBeNull();
  });

  it("NxM: paga menos de lo que lleva", () => {
    expect(() =>
      validarOferta({
        ...base,
        type: "BUY_X_PAY_Y",
        buyQuantity: 2,
        payQuantity: 2,
      }),
    ).toThrow("Paga tiene que ser menos");
    expect(
      validarOferta({
        ...base,
        type: "BUY_X_PAY_Y",
        buyQuantity: 3,
        payQuantity: 2,
      }).datos,
    ).toMatchObject({ buyQuantity: 3, payQuantity: 2, percentBps: null });
  });

  it("escalonada: escalones ordenados y sin repetir", () => {
    const resultado = validarOferta({
      ...base,
      type: "TIERED",
      tiers: [
        { minQuantity: 6, percentBps: 2000 },
        { minQuantity: 3, amountMinor: "10000" },
      ],
    });
    expect(resultado.tiers.map((tier) => tier.minQuantity)).toEqual([3, 6]);
    expect(() =>
      validarOferta({
        ...base,
        type: "TIERED",
        tiers: [
          { minQuantity: 3, percentBps: 1000 },
          { minQuantity: 3, percentBps: 2000 },
        ],
      }),
    ).toThrow("misma cantidad");
  });

  it("combo: sólo productos con cantidad", () => {
    expect(() =>
      validarOferta({
        ...base,
        type: "BUNDLE",
        percentBps: null,
        bundlePriceMinor: "100000",
        targets: [{ kind: "CATEGORY", id: "c1", quantity: 1 }],
      }),
    ).toThrow("productos puntuales");
    expect(
      validarOferta({
        ...base,
        type: "BUNDLE",
        percentBps: null,
        bundlePriceMinor: "100000",
        targets: [
          { kind: "PRODUCT", id: "a", quantity: 1 },
          { kind: "PRODUCT", id: "b", quantity: 1 },
        ],
      }).datos.bundlePriceMinor,
    ).toBe(100000n);
  });

  it("necesita al menos un destino que no sea exclusión", () => {
    expect(() =>
      validarOferta({
        ...base,
        targets: [{ kind: "PRODUCT", id: "p1", exclude: true }],
      }),
    ).toThrow("al menos un producto");
  });

  it("rechaza importes que no son centavos", () => {
    expect(() =>
      validarOferta({
        ...base,
        type: "AMOUNT_OFF",
        percentBps: null,
        amountMinor: "12.5",
      }),
    ).toThrow("en centavos");
  });
});
