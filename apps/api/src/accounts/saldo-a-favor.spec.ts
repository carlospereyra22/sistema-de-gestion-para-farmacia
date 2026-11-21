import {
  SALDO_A_FAVOR,
  esSaldoAFavor,
  readAllocations,
  repartirSaldoAFavor,
  saldoAFavorDisponible,
} from "./item-allocations";

describe("saldo a favor de una nota de crédito", () => {
  const credito = (items: { saleItemId: string; amountMinor: number }[]) => ({
    amountMinor: 1000n,
    allocations: { kind: SALDO_A_FAVOR, notaId: "n", items },
  });

  it("lo imputado cuenta como pagado y el resto sigue a favor", () => {
    const valor = credito([{ saleItemId: "a", amountMinor: 300 }]);
    expect(esSaldoAFavor(valor.allocations)).toBe(true);
    expect(readAllocations(valor.allocations)).toEqual([
      { saleItemId: "a", amountMinor: 300 },
    ]);
    expect(saldoAFavorDisponible(valor)).toBe(700n);
    expect(saldoAFavorDisponible({ amountMinor: 500n, allocations: [] })).toBe(
      0n,
    );
  });

  it("se descuenta de lo más viejo hasta agotar el saldo o la deuda", () => {
    expect(
      repartirSaldoAFavor(700n, [
        { saleItemId: "a", pendingMinor: 500n },
        { saleItemId: "b", pendingMinor: 0n },
        { saleItemId: "c", pendingMinor: 400n },
      ]),
    ).toEqual([
      { saleItemId: "a", amountMinor: 500 },
      { saleItemId: "c", amountMinor: 200 },
    ]);
    expect(
      repartirSaldoAFavor(700n, [{ saleItemId: "a", pendingMinor: 100n }]),
    ).toEqual([{ saleItemId: "a", amountMinor: 100 }]);
  });
});
