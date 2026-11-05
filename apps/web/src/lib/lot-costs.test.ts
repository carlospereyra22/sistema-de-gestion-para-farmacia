import { describe, expect, it } from "vitest";
import { lotHasManyCosts, lotReceiptRows } from "./lot-costs";

const receipt = (unitCostMinor: string | null, month: number) => ({
  quantity: 20,
  unitCostMinor,
  receivedAt: `2026-0${month}-10T15:00:00.000Z`,
});

describe("lotHasManyCosts", () => {
  it("distingue varios costos de varias entregas al mismo costo", () => {
    expect(lotHasManyCosts([receipt("100", 1), receipt("200", 2)])).toBe(true);
    expect(lotHasManyCosts([receipt("100", 1), receipt("100", 2)])).toBe(false);
    expect(lotHasManyCosts([receipt("100", 1)])).toBe(false);
    expect(lotHasManyCosts()).toBe(false);
  });

  it("no da por iguales las recepciones sin dato", () => {
    expect(lotHasManyCosts([receipt("100", 1), receipt(null, 2)])).toBe(true);
    expect(lotHasManyCosts([receipt(null, 1), receipt(null, 2)])).toBe(true);
  });
});

describe("lotReceiptRows", () => {
  const clean = (value: string) => value.replace(/\s/g, " ");

  it("da un renglón por recepción con su fecha, unidades y costo", () => {
    const rows = lotReceiptRows(
      [receipt("200000", 3), receipt("100000", 2)],
      "0",
    );
    expect(rows.map((row) => row.received)).toEqual([
      "10/3/2026 · 20 un.",
      "10/2/2026 · 20 un.",
    ]);
    expect(rows.map((row) => clean(row.cost))).toEqual([
      "$ 2.000,00",
      "$ 1.000,00",
    ]);
  });

  it("muestra costo cero como cero y sin dato lo que no se conoce", () => {
    expect(
      lotReceiptRows([receipt("0", 3), receipt(null, 2)], "0").map((row) =>
        clean(row.cost),
      ),
    ).toEqual(["$ 0,00", "Sin dato"]);
  });

  it("sin recepciones usa el costo del lote", () => {
    const [row] = lotReceiptRows(undefined, "99900");
    expect(row!.received).toBe("—");
    expect(clean(row!.cost)).toBe("$ 999,00");
  });
});
