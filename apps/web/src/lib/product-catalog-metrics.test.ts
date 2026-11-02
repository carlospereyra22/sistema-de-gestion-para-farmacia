import { describe, expect, it } from "vitest";
import {
  activeCatalogMetric,
  catalogMetricCounts,
  catalogStockTone,
  toggleCatalogMetric,
} from "./product-catalog-metrics";

const lot = (
  productId: string,
  quantity: number,
  sellableQuantity: number,
  expiryStatus: "EXPIRED" | "EXPIRING_SOON" | "AVAILABLE" = "AVAILABLE",
) => ({ productId, quantity, sellableQuantity, expiryStatus });

describe("indicadores del catálogo", () => {
  it("cuenta sin stock, stock bajo, por vencer y vencidos sólo de productos activos", () => {
    const counts = catalogMetricCounts(
      [
        { id: "sin-lotes", active: true },
        { id: "vencido", active: true },
        { id: "bajo", active: true },
        { id: "por-vencer", active: true },
        { id: "archivado", active: false },
        { id: "normal", active: true },
      ],
      [
        lot("vencido", 20, 0, "EXPIRED"),
        lot("bajo", 5, 5),
        lot("por-vencer", 30, 30, "EXPIRING_SOON"),
        lot("archivado", 1, 1, "EXPIRED"),
        lot("normal", 6, 6),
        lot("normal", 0, 0, "EXPIRED"),
      ],
    );
    expect(counts).toEqual({ out: 1, low: 1, expiring: 1, expired: 1 });
  });

  it("sin stock usa existencias físicas y stock bajo las vendibles", () => {
    expect(catalogStockTone(0, 0)).toBe("out");
    expect(catalogStockTone(20, 0)).toBe("ok");
    expect(catalogStockTone(20, 3)).toBe("low");
    expect(catalogStockTone(6, 6)).toBe("ok");
  });

  it("tocar un indicador lo activa como filtro y tocarlo de nuevo lo quita", () => {
    const vacio = { stock: "", expiry: "" };
    const bajo = toggleCatalogMetric("low", { stock: "", expiry: "expired" });
    expect(bajo).toEqual({ stock: "low", expiry: "" });
    expect(activeCatalogMetric(bajo)).toBe("low");
    expect(toggleCatalogMetric("low", bajo)).toEqual(vacio);
    expect(activeCatalogMetric({ stock: "available", expiry: "" })).toBe(
      undefined,
    );
  });
});
