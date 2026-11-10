import {
  aumentoSinConexion,
  renglonesDe,
  repartir,
  resolverImputaciones,
  type RenglonCuenta,
} from "./cuenta-sin-conexion";

const renglon = (
  saleItemId: string,
  pendingMinor: number,
  extra: Partial<RenglonCuenta> = {},
): RenglonCuenta => ({
  saleItemId,
  saleId: "venta-1",
  productId: "prod-" + saleItemId,
  description: null,
  name: "Artículo " + saleItemId,
  pendingMinor: String(pendingMinor),
  ...extra,
});

describe("repartir", () => {
  it("reparte en proporción y el redondeo cierra en el total", () => {
    expect(repartir(100n, [1n, 1n, 1n])).toEqual([33n, 34n, 33n]);
    expect(repartir(100n, [1n, 1n, 1n]).reduce((a, b) => a + b, 0n)).toBe(100n);
  });
  it("sin pesos va entero al primero", () => {
    expect(repartir(50n, [0n, 0n])).toEqual([50n, 0n]);
  });
});

describe("renglonesDe", () => {
  const renglones = [
    renglon("a", 100, { productId: "p1" }),
    renglon("b", 50, { productId: "p1" }),
    renglon("c", 70, { productId: null, description: "Inyección" }),
  ];
  it("encuentra los renglones de una venta sin conexión por producto", () => {
    expect(
      renglonesDe({ linea: { saleId: "venta-1", productId: "p1" } }, renglones),
    ).toHaveLength(2);
  });
  it("encuentra un concepto por su descripción", () => {
    expect(
      renglonesDe(
        { linea: { saleId: "venta-1", description: "Inyección" } },
        renglones,
      ).map((r) => r.saleItemId),
    ).toEqual(["c"]);
  });
});

describe("resolverImputaciones", () => {
  it("si el saldo es el que vio la PC, imputa como con conexión", () => {
    const r = resolverImputaciones(
      [{ saleItemId: "a", amountMinor: 400 }],
      [renglon("a", 1000)],
    );
    expect(r.allocations).toEqual([{ saleItemId: "a", amountMinor: 400 }]);
    expect(r.sobrante).toBe(0n);
    expect(r.avisos).toEqual([]);
  });

  it("si otra PC ya cobró una parte, imputa lo que entra y el resto queda a favor", () => {
    const r = resolverImputaciones(
      [{ saleItemId: "a", amountMinor: 1000 }],
      [renglon("a", 700)],
    );
    expect(r.allocations).toEqual([{ saleItemId: "a", amountMinor: 700 }]);
    expect(r.sobrante).toBe(300n);
    expect(r.avisos[0]?.kind).toBe("SALDO_DISTINTO");
  });

  it("un artículo sin saldo deja todo el importe a favor", () => {
    const r = resolverImputaciones(
      [{ saleItemId: "a", amountMinor: 500 }],
      [renglon("a", 0)],
    );
    expect(r.allocations).toEqual([]);
    expect(r.sobrante).toBe(500n);
  });

  it("ajuste con el saldo que vio la PC: se aplica igual que con conexión", () => {
    const r = resolverImputaciones(
      [
        {
          saleItemId: "a",
          amountMinor: 800,
          expectedPendingMinor: 1000,
          nextPendingMinor: 800,
        },
      ],
      [renglon("a", 1000)],
    );
    expect(r.ajustes).toEqual([
      { saleItemId: "a", before: 1000n, after: 800n, delta: -200n },
    ]);
    expect(r.allocations).toEqual([{ saleItemId: "a", amountMinor: 800 }]);
    expect(r.avisos).toEqual([]);
  });

  it("si el precio subió después del cobro, se respeta lo cobrado: no se suma la diferencia", () => {
    const r = resolverImputaciones(
      [
        {
          saleItemId: "a",
          amountMinor: 1000,
          expectedPendingMinor: 1000,
          nextPendingMinor: 1000,
        },
      ],
      [renglon("a", 1200)],
    );
    expect(r.ajustes).toEqual([
      { saleItemId: "a", before: 1200n, after: 1000n, delta: -200n },
    ]);
    expect(r.allocations).toEqual([{ saleItemId: "a", amountMinor: 1000 }]);
    expect(r.sobrante).toBe(0n);
    expect(r.avisos[0]?.kind).toBe("SALDO_DISTINTO");
  });

  it("si ya se cobró una parte en otro lado, no ajusta y lo que sobra queda a favor", () => {
    const r = resolverImputaciones(
      [
        {
          saleItemId: "a",
          amountMinor: 800,
          expectedPendingMinor: 1000,
          nextPendingMinor: 800,
        },
      ],
      [renglon("a", 700)],
    );
    expect(r.ajustes).toEqual([]);
    expect(r.allocations).toEqual([{ saleItemId: "a", amountMinor: 700 }]);
    expect(r.sobrante).toBe(100n);
  });

  it("un renglón de venta sin conexión se reparte entre sus lotes", () => {
    const r = resolverImputaciones(
      [{ linea: { saleId: "venta-1", productId: "p1" }, amountMinor: 120 }],
      [
        renglon("a", 100, { productId: "p1" }),
        renglon("b", 50, { productId: "p1" }),
      ],
    );
    expect(r.allocations).toEqual([
      { saleItemId: "a", amountMinor: 100 },
      { saleItemId: "b", amountMinor: 20 },
    ]);
  });
});

describe("aumentoSinConexion", () => {
  it("suma la diferencia pedida sobre el saldo de hoy", () => {
    expect(aumentoSinConexion(1000n, 1300n, 700n)).toEqual({
      delta: 300n,
      siguiente: 1000n,
      cambio: true,
    });
  });
});
