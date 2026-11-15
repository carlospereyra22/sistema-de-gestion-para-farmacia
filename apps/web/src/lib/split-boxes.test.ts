import { describe, expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  splitSummary,
  splitTarget,
  splitTargetOptions,
  splittableLots,
} from "./split-boxes";

const lot = (id: string, productId: string, sellableQuantity: number) =>
  ({
    id,
    productId,
    sellableQuantity,
    number: id,
    expiresAt: null,
  }) as StockLot;

describe("abrir cajas: vista previa", () => {
  it("ofrece sólo lotes vendibles de la caja", () => {
    expect(
      splittableLots(
        [lot("a", "x100", 3), lot("b", "x100", 0), lot("c", "x10", 5)],
        "x100",
      ).map((l) => l.id),
    ).toEqual(["a"]);
  });

  it("encuentra el producto en el que se abre", () => {
    const x10 = { id: "x10", name: "Buscapina x10" } as CatalogProduct;
    expect(
      splitTarget({ splitTargetProductId: "x10", splitFactor: 10 }, [x10]),
    ).toEqual({ target: x10, factor: 10 });
    expect(
      splitTarget({ splitTargetProductId: null, splitFactor: null }, [x10]),
    ).toBeNull();
    expect(
      splitTarget({ splitTargetProductId: "otro", splitFactor: 10 }, [x10]),
    ).toBeNull();
  });

  it("resume la apertura con lote y vencimiento", () => {
    expect(
      splitSummary(
        "Buscapina x100",
        "Buscapina x10",
        { number: "L1", expiresAt: "2027-05-31" },
        2,
        10,
      ),
    ).toBe(
      "2 cajas de Buscapina x100 (lote L1, vence 05/2027) → +20 Buscapina x10, mismo lote y vencimiento.",
    );
    expect(
      splitSummary("A", "B", { number: "L", expiresAt: null }, 1, 10),
    ).toContain("1 caja de A (lote L, sin vencimiento)");
  });
});

describe("abrir cajas: en qué presentación", () => {
  const p = (id: string, presentation: string, extra = {}) =>
    ({
      id,
      name: "BUSCAPINA DUO",
      presentation,
      laboratory: { id: "op", name: "Opella" },
      active: true,
      ...extra,
    }) as CatalogProduct;
  it("ofrece primero el vínculo y después las otras presentaciones", () => {
    const x10 = p("x10", "blíster comp.rec.x 10");
    const x20 = p("x20", "comp.rec.x 20");
    const caja = p("x100", "comp.rec.x 100", {
      splitTargetProductId: "x10",
      splitFactor: 10,
    });
    expect(splitTargetOptions(caja, [caja, x20, x10])).toEqual([
      { id: "x10", label: "BUSCAPINA DUO · blíster comp.rec.x 10", factor: 10 },
      { id: "x20", label: "BUSCAPINA DUO · comp.rec.x 20", factor: 5 },
    ]);
  });
});
