import {
  armarRenglonesNota,
  devueltoPorRenglon,
  repartirNota,
  whereNotasCredito,
  type RenglonVendido,
} from "./nota-credito";

const renglon = (cambios: Partial<RenglonVendido> = {}): RenglonVendido => ({
  id: "r1",
  productId: "p1",
  lotId: "l1",
  quantity: 3,
  unitPriceMinor: 1000n,
  discountMinor: 0n,
  ...cambios,
});

describe("nota de crédito: renglones", () => {
  it("la venta entera acredita el total de cada renglón", () => {
    const [linea] = armarRenglonesNota([renglon()], new Map(), [
      { saleItemId: "r1", quantity: 3, reponer: true },
    ]);
    expect(linea!.amountMinor).toBe(3000n);
    expect(linea!.discountMinor).toBe(0n);
  });

  it("prorratea el descuento y el último centavo va a la última unidad", () => {
    const vendido = renglon({ discountMinor: 1n });
    const primera = armarRenglonesNota([vendido], new Map(), [
      { saleItemId: "r1", quantity: 1, reponer: false },
    ])[0]!;
    const resto = armarRenglonesNota([vendido], new Map([["r1", 1]]), [
      { saleItemId: "r1", quantity: 2, reponer: false },
    ])[0]!;
    expect(primera.amountMinor + resto.amountMinor).toBe(2999n);
    expect(primera.amountMinor).toBe(999n);
  });

  it("no deja devolver más de lo que queda sin devolver", () => {
    expect(() =>
      armarRenglonesNota([renglon()], new Map([["r1", 2]]), [
        { saleItemId: "r1", quantity: 2, reponer: false },
      ]),
    ).toThrow("supera");
  });

  it("rechaza productos ajenos, repetidos o cantidades no enteras", () => {
    expect(() =>
      armarRenglonesNota([renglon()], new Map(), [
        { saleItemId: "otro", quantity: 1, reponer: false },
      ]),
    ).toThrow("no es de esta venta");
    expect(() =>
      armarRenglonesNota([renglon()], new Map(), [
        { saleItemId: "r1", quantity: 1, reponer: false },
        { saleItemId: "r1", quantity: 1, reponer: false },
      ]),
    ).toThrow("una sola vez");
    expect(() =>
      armarRenglonesNota([renglon()], new Map(), [
        { saleItemId: "r1", quantity: 1.5, reponer: false },
      ]),
    ).toThrow("cantidades");
  });

  it("un concepto o un renglón sin lote se acredita pero no se repone", () => {
    const concepto = renglon({ productId: null, lotId: null });
    expect(
      armarRenglonesNota([concepto], new Map(), [
        { saleItemId: "r1", quantity: 1, reponer: false },
      ])[0]!.amountMinor,
    ).toBe(1000n);
    expect(() =>
      armarRenglonesNota([concepto], new Map(), [
        { saleItemId: "r1", quantity: 1, reponer: true },
      ]),
    ).toThrow("concepto");
    expect(() =>
      armarRenglonesNota([renglon({ lotId: null })], new Map(), [
        { saleItemId: "r1", quantity: 1, reponer: true },
      ]),
    ).toThrow("sin lote");
  });
});

describe("nota de crédito: lo ya devuelto", () => {
  it("suma devoluciones y notas anteriores sin contar dos veces la liquidación", () => {
    const nota = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const devuelto = devueltoPorRenglon(
      [
        { saleItemId: "r1", quantity: 1, creditKind: null, reason: "Roto" },
        { saleItemId: "r1", quantity: 1, creditKind: "INTERNA", reason: "x" },
        {
          saleItemId: "r1",
          quantity: 2,
          creditKind: null,
          reason: `Nota de crédito ${nota}`,
        },
      ],
      [{ saleItemId: "r1", quantity: 2 }],
    );
    expect(devuelto.get("r1")).toBe(4);
  });
});

describe("nota de crédito: reparto", () => {
  it("baja primero la cuenta corriente del artículo y devuelve el resto", () => {
    const reparto = repartirNota(
      [
        { saleItemId: "r1", amountMinor: 1000n },
        { saleItemId: "r2", amountMinor: 500n },
      ],
      new Map([
        ["r1", 300n],
        ["r2", 900n],
      ]),
    );
    expect(reparto).toEqual({
      totalMinor: 1500n,
      accountMinor: 800n,
      refundMinor: 700n,
      allocations: [
        { saleItemId: "r1", amountMinor: 300 },
        { saleItemId: "r2", amountMinor: 500 },
      ],
    });
  });

  it("sin cuenta corriente devuelve todo en plata", () => {
    expect(
      repartirNota([{ saleItemId: "r1", amountMinor: 1000n }], new Map()),
    ).toMatchObject({ accountMinor: 0n, refundMinor: 1000n, allocations: [] });
  });
});

describe("nota de crédito: filtro del listado", () => {
  it("sólo notas de la sucursal, por fecha de Argentina, tipo y código", () => {
    expect(
      whereNotasCredito("org", "suc", {
        from: "2026-11-01",
        to: "2026-11-30",
        creditKind: "INTERNA",
        q: "ce27",
      }),
    ).toEqual({
      organizationId: "org",
      branchId: "suc",
      creditKind: "INTERNA",
      createdAt: {
        gte: new Date("2026-11-01T03:00:00.000Z"),
        lt: new Date("2026-12-01T03:00:00.000Z"),
      },
      OR: [
        {
          id: {
            gte: "ce270000-0000-0000-0000-000000000000",
            lte: "ce27ffff-ffff-ffff-ffff-ffffffffffff",
          },
        },
        {
          saleId: {
            gte: "ce270000-0000-0000-0000-000000000000",
            lte: "ce27ffff-ffff-ffff-ffff-ffffffffffff",
          },
        },
      ],
    });
    expect(whereNotasCredito("org", "suc", {}).creditKind).toEqual({
      not: null,
    });
    expect(whereNotasCredito("org", "suc", { q: "zz" }).OR).toEqual([
      { id: { in: [] } },
    ]);
  });
});
