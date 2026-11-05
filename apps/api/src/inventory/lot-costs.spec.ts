import { inventoryCosts } from "./lot-costs";

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

describe("inventoryCosts", () => {
  it("conserva cada costo de un mismo lote, del más nuevo al más viejo", () => {
    const result = inventoryCosts(
      [movement("m1", "a", 1, 100n), movement("m2", "a", 9, 150n)],
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
          },
          {
            quantity: 5,
            unitCostMinor: "100",
            receivedAt: day(1).toISOString(),
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
