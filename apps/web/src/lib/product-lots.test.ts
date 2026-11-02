import { describe, expect, it } from "vitest";
import {
  leadingLot,
  lotNumberMatches,
  productLots,
  productStockStatus,
  visibleProductLots,
} from "./product-lots";

const lot = (id: string, quantity: number, expiresAt: string | null) => ({
  id,
  productId: id.startsWith("otro") ? "b" : "a",
  number: id,
  quantity,
  expiresAt,
  expiryStatus: "AVAILABLE" as const,
});

describe("lotes del producto", () => {
  it("lista sólo lotes con unidades, del que vence antes al que no tiene fecha", () => {
    const lots = productLots(
      [
        lot("sin-fecha", 3, null),
        lot("2028", 5, "2028-01-01"),
        lot("vacio", 0, "2026-01-01"),
        lot("2027", 2, "2027-03-01"),
        lot("otro", 9, "2026-02-01"),
      ],
      "a",
    );
    expect(lots.map((item) => item.id)).toEqual(["2027", "2028", "sin-fecha"]);
  });

  it("el detalle ordena por vencer, normales y vencidos, y respeta el filtro de vencimiento", () => {
    const stock = [
      { ...lot("vencido", 4, "2026-10-01"), expiryStatus: "EXPIRED" as const },
      {
        ...lot("vacio", 0, "2026-12-01"),
        expiryStatus: "EXPIRING_SOON" as const,
      },
      lot("sin-fecha", 2, null),
      lot("bueno-2029", 9, "2029-01-01"),
      lot("bueno-2028", 9, "2028-01-01"),
      {
        ...lot("por-vencer", 3, "2026-12-20"),
        expiryStatus: "EXPIRING_SOON" as const,
      },
    ];
    const ids = (expiry: string) =>
      visibleProductLots(stock, "a", expiry).map((item) => item.id);
    expect(ids("")).toEqual([
      "por-vencer",
      "bueno-2028",
      "bueno-2029",
      "sin-fecha",
      "vencido",
    ]);
    expect(ids("expired")).toEqual(["vencido"]);
    expect(ids("undated")).toEqual(["sin-fecha"]);
  });

  it("busca lotes sin importar mayúsculas, espacios ni guiones", () => {
    expect(lotNumberMatches("L-2304A", "l2304")).toBe(true);
    expect(lotNumberMatches("L 2304/A", "2304a")).toBe(true);
    expect(lotNumberMatches("L-2304A", "2305")).toBe(false);
    expect(lotNumberMatches("L-2304A", "  ")).toBe(true);
    const stock = [lot("L-100", 2, null), lot("L-200", 3, null)];
    expect(
      visibleProductLots(stock, "a", "", "l 200").map((item) => item.id),
    ).toEqual(["L-200"]);
  });

  it("el estado sigue al primer lote del orden y cuenta los vencidos aparte", () => {
    const con = (...status: ("EXPIRED" | "EXPIRING_SOON" | "AVAILABLE")[]) =>
      status.map((expiryStatus) => ({
        quantity: 10,
        expiresAt: "2027-01-01",
        expiryStatus,
      }));
    const state = (
      active: boolean,
      lots: ReturnType<typeof con>,
      sellable = 10,
    ) => {
      const { label, expiredLots } = productStockStatus(active, lots, sellable);
      return `${label}/${expiredLots}`;
    };
    expect(state(false, con("EXPIRED"))).toBe("Archivado/0");
    expect(state(true, [])).toBe("Sin stock/0");
    expect(state(true, con("EXPIRED", "EXPIRED"), 0)).toBe("Vencido/0");
    expect(state(true, con("EXPIRED", "AVAILABLE"))).toBe("Activo/1");
    expect(state(true, con("AVAILABLE", "EXPIRING_SOON"))).toBe("Por vencer/0");
    expect(state(true, con("AVAILABLE"), 3)).toBe("Stock bajo/0");
    expect(state(true, con("AVAILABLE"))).toBe("Activo/0");
  });

  it("con el filtro Stock bajo el estado dice Stock bajo aunque haya lotes por vencer", () => {
    const lots = [
      { quantity: 3, expiresAt: "2026-12-01", expiryStatus: "EXPIRING_SOON" },
      { quantity: 4, expiresAt: "2026-10-01", expiryStatus: "EXPIRED" },
    ] as const;
    expect(productStockStatus(true, [...lots], 3).label).toBe("Por vencer");
    const filtered = productStockStatus(true, [...lots], 3, "low");
    expect(filtered.label).toBe("Stock bajo");
    expect(filtered.expiredLots).toBe(1);
  });

  it("próx. venc. sale del primer lote del orden, no del vencido", () => {
    expect(
      leadingLot([
        { id: "vencido", expiresAt: "2026-10-01", expiryStatus: "EXPIRED" },
        { id: "normal", expiresAt: "2027-05-18", expiryStatus: "AVAILABLE" },
      ] as const)?.id,
    ).toBe("normal");
  });
});
