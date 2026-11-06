import { inventoryCosts, lotAdjustments, lotReturns } from "./lot-costs";

const day = (value: number) => new Date(Date.UTC(2026, 0, value));
const lot = (id: string, cost: bigint, quantity = 10, productId = "p") => ({
  id,
  productId,
  quantity,
  unitCostMinor: cost,
  createdAt: day(1),
});
const movement = (
  id: string,
  lotId: string | null,
  value: number,
  unitCostMinor: bigint | null,
  productId = "p",
  referenceType: string | null = null,
) => ({
  id,
  productId,
  lotId,
  quantity: 5,
  occurredAt: day(value),
  unitCostMinor,
  referenceType,
});

describe("lotAdjustments", () => {
  it("toma cantidad y motivo de la auditoría del ajuste", () => {
    expect(
      lotAdjustments([
        {
          entityId: "a",
          createdAt: day(2),
          after: { delta: 4, reason: "Conteo" },
        },
      ]),
    ).toEqual([
      {
        kind: "ADJUSTMENT",
        lotId: "a",
        quantity: 4,
        reason: "Conteo",
        adjustedAt: day(2).toISOString(),
        supplierId: null,
        unitCostMinor: null,
      },
    ]);
  });
  it("conserva el proveedor elegido en el ajuste", () => {
    expect(
      lotAdjustments([
        {
          entityId: "a",
          createdAt: day(2),
          after: { delta: 4, reason: "Conteo", supplierId: "juan" },
        },
      ])[0]?.supplierId,
    ).toBe("juan");
  });
  it("descarta registros sin cantidad y tolera la falta de motivo", () => {
    const rows = lotAdjustments([
      { entityId: "a", createdAt: day(2), after: null },
      { entityId: null, createdAt: day(2), after: { delta: 4 } },
      { entityId: "b", createdAt: day(3), after: { delta: -1 } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lotId: "b", quantity: -1, reason: "" });
  });
});

describe("lotReturns", () => {
  it("deja la devolución con signo negativo, proveedor y motivo", () => {
    expect(
      lotReturns([
        {
          lotId: "a",
          supplierId: "juan",
          quantity: 10,
          reason: "Vencido",
          createdAt: day(3),
        },
      ]),
    ).toEqual([
      {
        kind: "RETURN",
        lotId: "a",
        quantity: -10,
        reason: "Vencido",
        adjustedAt: day(3).toISOString(),
        supplierId: "juan",
        unitCostMinor: null,
      },
    ]);
  });
});

describe("inventoryCosts", () => {
  it("un ajuste con costo cambia el último costo sin ser una recepción", () => {
    const result = inventoryCosts(
      [
        movement("m1", "a", 1, 100n),
        { ...movement("m2", "a", 9, 150n), type: "ADJUSTMENT_IN" },
      ],
      new Map(),
      [lot("a", 150n)],
    );
    expect(result.products[0]?.unitCostMinor).toBe("150");
    expect(result.lots[0]?.receipts).toHaveLength(1);
  });

  it("una recepción vieja sin costo no toma el costo de un ajuste", () => {
    const result = inventoryCosts(
      [
        movement("m1", "a", 1, null),
        { ...movement("m2", "a", 9, 150n), type: "ADJUSTMENT_IN" },
      ],
      new Map(),
      [lot("a", 150n)],
    );
    expect(result.lots[0]?.receipts[0]?.unitCostMinor).toBeNull();
  });

  it("conserva cada costo de un mismo lote, del más nuevo al más viejo", () => {
    const result = inventoryCosts(
      [
        movement("m1", "a", 1, 100n),
        { ...movement("m2", "a", 9, 150n), supplierId: "juan" },
      ],
      new Map(),
      [lot("a", 150n)],
    );
    expect(result.lots).toEqual([
      {
        lotId: "a",
        receipts: [
          {
            quantity: 5,
            unitCostMinor: "150",
            receivedAt: day(9).toISOString(),
            supplierId: "juan",
          },
          {
            quantity: 5,
            unitCostMinor: "100",
            receivedAt: day(1).toISOString(),
            supplierId: null,
          },
        ],
      },
    ]);
  });

  it("el costo del producto es el de la última recepción, aunque sea de otro lote", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, 100n), movement("m2", "b", 9, 200n)],
      new Map(),
      [lot("a", 100n), lot("b", 200n)],
    );
    expect(result.products).toEqual([
      {
        productId: "p",
        unitCostMinor: "200",
        receivedAt: day(9).toISOString(),
      },
    ]);
  });

  it("toma el último costo aunque ese lote ya esté agotado, y no lista el lote", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, 100n), movement("m2", "b", 9, 200n)],
      new Map(),
      [lot("a", 100n), lot("b", 200n, 0)],
    );
    expect(result.products[0]!.unitCostMinor).toBe("200");
    expect(result.lots.map((item) => item.lotId)).toEqual(["a"]);
  });

  it("recupera de Compras el costo de recepciones anteriores a la columna", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, null), movement("m2", "a", 9, null)],
      new Map([
        ["m1", 100n],
        ["m2", 150n],
      ]),
      [lot("a", 100n)],
    );
    expect(result.lots[0]!.receipts.map((item) => item.unitCostMinor)).toEqual([
      "150",
      "100",
    ]);
  });

  it("en Inventario viejo sólo conoce la última recepción y no inventa las anteriores", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, null), movement("m2", "a", 9, null)],
      new Map(),
      [lot("a", 150n)],
    );
    expect(result.lots[0]!.receipts.map((item) => item.unitCostMinor)).toEqual([
      "150",
      null,
    ]);
  });

  it("una compra posterior no deja sin dato la recepción que dio el costo al lote", () => {
    const result = inventoryCosts(
      [
        movement("m1", "a", 1, null),
        movement("m2", "a", 9, 70000n, "p", "PURCHASE"),
      ],
      new Map(),
      [lot("a", 0n)],
    );
    expect(result.lots[0]!.receipts.map((item) => item.unitCostMinor)).toEqual([
      "70000",
      "0",
    ]);
    expect(result.products[0]!.unitCostMinor).toBe("70000");
  });

  it("una recepción de Inventario posterior sí pisó el costo anterior", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, null), movement("m2", "a", 9, 150n)],
      new Map(),
      [lot("a", 150n)],
    );
    expect(result.lots[0]!.receipts.map((item) => item.unitCostMinor)).toEqual([
      "150",
      null,
    ]);
  });

  it("sin recepciones usa el costo del lote más nuevo del producto", () => {
    const result = inventoryCosts([], new Map(), [
      lot("viejo", 100n),
      { ...lot("nuevo", 300n), createdAt: day(5) },
    ]);
    expect(result.products[0]!.unitCostMinor).toBe("300");
    expect(result.lots).toEqual([]);
  });
});
