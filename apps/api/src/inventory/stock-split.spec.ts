import {
  fractionCostMinor,
  splitPayload,
  splitSupplierUnits,
} from "./stock-split";

describe("abrir cajas", () => {
  it("divide el costo de la caja redondeando a centavos", () => {
    expect(fractionCostMinor(1_000_000n, 10)).toBe(100_000n);
    expect(fractionCostMinor(1_005n, 10)).toBe(101n);
    expect(fractionCostMinor(1_004n, 10)).toBe(100n);
  });

  it("valida la cantidad de cajas y arma una huella estable", () => {
    for (const boxes of [0, -1, 1.5, 1_000_001])
      expect(() => splitPayload({ requestId: "r", lotId: "l", boxes })).toThrow(
        "cuántas cajas",
      );
    expect(splitPayload({ requestId: "a", lotId: "l", boxes: 2 })).toBe(
      splitPayload({ requestId: "b", lotId: "l", boxes: 2 }),
    );
    expect(splitPayload({ requestId: "a", lotId: "l", boxes: 2 })).not.toBe(
      splitPayload({ requestId: "a", lotId: "l", boxes: 3 }),
    );
  });

  it("las unidades abiertas conservan el proveedor de las cajas", () => {
    // Lote con 3 cajas de A (las más viejas) y 2 de B; se abren 4.
    const before = new Map<string | null, number>([
      ["A", 3],
      ["B", 2],
    ]);
    const after = new Map<string | null, number>([
      ["A", 0],
      ["B", 1],
    ]);
    expect(splitSupplierUnits(before, after, 10)).toEqual([
      { supplierId: "A", quantity: 30 },
      { supplierId: "B", quantity: 10 },
    ]);
  });
});
