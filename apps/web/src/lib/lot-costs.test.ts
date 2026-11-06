import { describe, expect, it } from "vitest";
import {
  adjustmentsByLot,
  lotHasManyCosts,
  lotHistoryEntries,
  lotLastCost,
  lotMovementGroups,
  lotReceiptRows,
  supplierNamesById,
} from "./lot-costs";

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

describe("lotMovementGroups", () => {
  const origin = (id: string | null, name: string, quantity: number) => ({
    key: id ?? "sin-proveedor",
    name,
    quantity,
    supplier: id ? { id } : null,
  });
  const row = (
    received: string,
    supplierId: string | null,
    supplierName = "",
  ) => ({
    received,
    cost: "$ 1,00",
    supplierId,
    supplierName,
  });

  it("deja cada movimiento con su proveedor", () => {
    const groups = lotMovementGroups(
      [origin("b", "carlos", 14), origin("a", "juan", 10)],
      [row("1", "b"), row("2", "a"), row("3", "b")],
    );
    expect(
      groups.map((group) => [group.name, group.rows.map((r) => r.received)]),
    ).toEqual([
      ["carlos", ["1", "3"]],
      ["juan", ["2"]],
    ]);
  });
  it("muestra en 0 a quien tiene historial pero ya no tiene unidades", () => {
    const groups = lotMovementGroups(
      [origin(null, "Sin proveedor", 34)],
      [row("1", "a", "juan"), row("2", "a", "juan"), row("3", null)],
    );
    expect(
      groups.map((group) => [group.name, group.quantity, group.rows.length]),
    ).toEqual([
      ["Sin proveedor", 34, 1],
      ["juan", 0, 2],
    ]);
  });
  it("no toma el renglón que sólo trae el costo del lote", () => {
    const groups = lotMovementGroups(
      [origin(null, "Sin proveedor", 12)],
      [{ received: "—", cost: "$ 1,00" }],
    );
    expect(groups[0]?.rows).toEqual([]);
  });
});

describe("resumen del historial", () => {
  const adjustment = {
    received: "6/11/2026 · +4 un.",
    cost: "—",
    adjustment: { reason: "Conteo" },
  };
  const entry = { received: "5/11/2026 · 1 un.", cost: "$ 700,00" };
  const fallback = { received: "—", cost: "$ 999,00" };

  it("cuenta ajustes y recepciones, sin el renglón de respaldo", () => {
    expect(lotHistoryEntries([adjustment, entry])).toHaveLength(2);
    expect(lotHistoryEntries([adjustment, fallback])).toEqual([adjustment]);
  });
  it("toma el costo de lo último que entró, aunque haya ajustes después", () => {
    expect(lotLastCost([adjustment, entry])).toBe("$ 700,00");
    expect(lotLastCost([adjustment, fallback])).toBe("$ 999,00");
    expect(lotLastCost([adjustment])).toBe("—");
    expect(lotLastCost([{ ...adjustment, cost: "$ 25,00" }, entry])).toBe(
      "$ 25,00",
    );
  });
});

it("resuelve nombres de proveedores y tolera una API que no los envía", () => {
  expect(supplierNamesById([{ id: "a", name: "juan" }]).get("a")).toBe("juan");
  expect(supplierNamesById(undefined).size).toBe(0);
});

it("agrupa los ajustes por lote", () => {
  const item = (lotId: string, quantity: number) => ({
    lotId,
    quantity,
    reason: "Conteo",
    adjustedAt: "2026-02-11T15:00:00.000Z",
  });
  const byLot = adjustmentsByLot([item("a", 1), item("b", 2), item("a", 3)]);
  expect(byLot.get("a")?.map((row) => row.quantity)).toEqual([1, 3]);
  expect(byLot.get("b")).toHaveLength(1);
  expect(adjustmentsByLot().size).toBe(0);
});

describe("lotReceiptRows", () => {
  const clean = (value: string) => value.replace(/\s/g, " ");
  const adjustment = (quantity: number, month: number, reason = "Conteo") => ({
    lotId: "lote",
    quantity,
    reason,
    adjustedAt: `2026-0${month}-11T15:00:00.000Z`,
  });

  it("intercala los ajustes por fecha, con signo, sin costo y con motivo", () => {
    const rows = lotReceiptRows(
      [receipt("200000", 3), receipt("100000", 1)],
      "0",
      [adjustment(4, 2), adjustment(-3, 4, "Rotura")],
    );
    expect(rows.map((row) => row.received)).toEqual([
      "11/4/2026 · −3 un.",
      "10/3/2026 · 20 un.",
      "11/2/2026 · +4 un.",
      "10/1/2026 · 20 un.",
    ]);
    expect(rows[0]).toMatchObject({
      cost: "—",
      adjustment: { reason: "Rotura" },
    });
    expect(rows[1]!.adjustment).toBeUndefined();
  });
  it("marca las devoluciones y las ordena con el resto", () => {
    const rows = lotReceiptRows([receipt("100", 1)], "0", [
      { ...adjustment(-10, 2, "Vencido"), kind: "RETURN" },
    ]);
    expect(rows[0]).toMatchObject({
      received: "11/2/2026 · −10 un.",
      cost: "—",
      adjustment: { reason: "Vencido", returned: true },
    });
  });
  it("muestra el costo de un ajuste que lo tiene", () => {
    const [row] = lotReceiptRows([], "0", [
      { ...adjustment(4, 2), unitCostMinor: "2500" },
    ]);
    expect(clean(row!.cost)).toBe("$ 25,00");
  });
  it("resuelve el nombre del proveedor de cada movimiento", () => {
    const [received, adjusted] = lotReceiptRows(
      [{ ...receipt("100", 3), supplierId: "a" }],
      "0",
      [{ ...adjustment(4, 2), supplierId: null }],
      new Map([["a", "carlos"]]),
    );
    expect(received).toMatchObject({ supplierId: "a", supplierName: "carlos" });
    expect(adjusted).toMatchObject({
      supplierId: null,
      supplierName: "Sin proveedor",
    });
  });
  it("sin recepciones conserva el costo del lote después de los ajustes", () => {
    const rows = lotReceiptRows([], "99900", [adjustment(4, 2)]);
    expect(rows.map((row) => row.received)).toEqual([
      "11/2/2026 · +4 un.",
      "—",
    ]);
    expect(clean(rows[1]!.cost)).toBe("$ 999,00");
  });

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
