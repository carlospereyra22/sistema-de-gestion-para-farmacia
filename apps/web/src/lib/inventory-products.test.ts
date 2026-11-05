import { describe, expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  emptyInventoryFilters,
  inventoryMetricProducts,
  inventoryPage,
  inventoryRows,
  inventoryStockProductOptions,
} from "./inventory-products";
import { catalogMetricCounts } from "./product-catalog-metrics";

const now = new Date("2026-11-05T12:00:00.000Z");

function product(id: string, name: string, extra = {}): CatalogProduct {
  return {
    id,
    name,
    active: true,
    barcodes: [],
    saleUnit: "BOX",
    ...extra,
  } as unknown as CatalogProduct;
}

function lot(
  id: string,
  productId: string,
  status: StockLot["expiryStatus"],
  extra: Partial<StockLot> = {},
): StockLot {
  const quantity = extra.quantity ?? 10;
  const expired = status === "EXPIRED";
  return {
    id,
    productId,
    productName: `Nombre ${productId}`,
    number: id,
    quantity,
    sellableQuantity: expired ? 0 : quantity,
    expiredQuantity: expired ? quantity : 0,
    expiryStatus: status,
    expiresAt: expired
      ? "2026-07-25T00:00:00.000Z"
      : status === "EXPIRING_SOON"
        ? "2026-12-25T00:00:00.000Z"
        : "2027-10-01T00:00:00.000Z",
    unitCostMinor: "100",
    metadataVersion: 0,
    ...extra,
  };
}

const products = [
  product("actron", "Actron", {
    barcodes: [{ code: "7896902211124" }],
  }),
  product("alikal", "Alikal"),
  product("buscapina", "Buscapina"),
  product("curitas", "Curitas"),
];
const stock = [
  lot("A-1", "actron", "EXPIRED"),
  lot("A-2", "actron", "AVAILABLE"),
  lot("A-3", "actron", "EXPIRING_SOON"),
  lot("L-1", "alikal", "EXPIRED"),
  lot("B-1", "buscapina", "AVAILABLE", { quantity: 3 }),
];
const rows = (filters = {}, list = products, lots = stock) =>
  inventoryRows(list, lots, { ...emptyInventoryFilters, ...filters }, now);
const names = (filters = {}) => rows(filters).map((row) => row.name);

describe("inventoryRows", () => {
  it("agrupa los lotes en una fila por producto con sus totales", () => {
    const actron = rows()[0]!;
    expect(actron).toMatchObject({
      name: "Actron",
      physical: 30,
      sellable: 20,
      hiddenLots: 0,
    });
    expect(actron.lots.map((item) => item.number)).toEqual([
      "A-3",
      "A-2",
      "A-1",
    ]);
    expect(actron.leading?.number).toBe("A-3");
    expect(actron.status).toEqual({
      label: "Por vencer",
      tone: "warning",
      expiredLots: 1,
    });
  });

  it("ordena lo próximo a vencer primero, lo vencido después y lo sin stock al final", () => {
    expect(names()).toEqual(["Actron", "Buscapina", "Alikal", "Curitas"]);
  });

  it("filtra por stock con los mismos criterios de Productos", () => {
    expect(names({ stock: "available" })).toEqual([
      "Actron",
      "Buscapina",
      "Alikal",
    ]);
    expect(names({ stock: "out" })).toEqual(["Curitas"]);
    // Alikal sólo tiene vencidos: tiene stock físico, así que no es Sin stock,
    // y con 0 vendibles tampoco es Stock bajo. Se ve en Vencidos, como en Productos.
    expect(names({ stock: "low" })).toEqual(["Buscapina"]);
  });

  it("con Vencidos muestra sólo esos lotes y cuenta los que quedan ocultos", () => {
    expect(names({ expiry: "expired" })).toEqual(["Actron", "Alikal"]);
    const actron = rows({ expiry: "expired" })[0]!;
    expect(actron.lots.map((item) => item.number)).toEqual(["A-1"]);
    expect(actron.hiddenLots).toBe(2);
    expect(actron.physical).toBe(30);
  });

  it("busca por número de lote sin importar mayúsculas ni guiones", () => {
    expect(names({ lot: "a 2" })).toEqual(["Actron"]);
    expect(rows({ lot: "a 2" })[0]!.lots.map((item) => item.number)).toEqual([
      "A-2",
    ]);
    expect(names({ lot: "no-existe" })).toEqual([]);
  });

  it("busca por código de barras y combina el buscador con los filtros", () => {
    expect(names({ query: "7896902211124" })).toEqual(["Actron"]);
    expect(names({ query: "alikal", expiry: "expired" })).toEqual(["Alikal"]);
    expect(names({ query: "buscapina", expiry: "expired" })).toEqual([]);
  });

  it("no pierde unidades de productos archivados o fuera del catálogo", () => {
    const list = [product("archivado", "Archivado", { active: false })];
    const lots = [
      lot("X-1", "archivado", "AVAILABLE"),
      lot("Y-1", "otro", "AVAILABLE"),
    ];
    const result = rows({}, list, lots);
    expect(result.map((row) => row.name)).toEqual(["Archivado", "Nombre otro"]);
    expect(result[0]!.status.label).toBe("Archivado");
    expect(result[1]!.product).toBeUndefined();
  });

  it("no lista archivados sin unidades", () => {
    const list = [product("archivado", "Archivado", { active: false })];
    expect(rows({}, list, [])).toEqual([]);
  });

  it("no toma los lotes en cero como existencias", () => {
    const [row] = rows(
      {},
      [products[0]!],
      [lot("Z-1", "actron", "AVAILABLE", { quantity: 0 })],
    );
    expect(row).toMatchObject({ lots: [], physical: 0 });
    expect(row!.status.label).toBe("Sin stock");
  });
});

describe("inventoryMetricProducts", () => {
  it("hace que cada tarjeta coincida con lo que muestra su filtro", () => {
    const list = [
      ...products,
      product("archivado", "Archivado", { active: false }),
      product("vacio", "Archivado sin lotes", { active: false }),
    ];
    const lots = [...stock, lot("X-1", "archivado", "EXPIRED")];
    const counts = catalogMetricCounts(
      inventoryMetricProducts(list, lots),
      lots,
    );
    expect(counts.out).toBe(rows({ stock: "out" }, list, lots).length);
    expect(counts.low).toBe(rows({ stock: "low" }, list, lots).length);
    expect(counts.expired).toBe(rows({ expiry: "expired" }, list, lots).length);
    expect(counts.expiring).toBe(
      rows({ expiry: "expiring" }, list, lots).length,
    );
  });
});

describe("inventoryPage", () => {
  const many = Array.from({ length: 23 }, (_, index) =>
    product(`p-${index}`, `Producto ${index}`),
  );
  const lots = many.map((item) => lot(`lote-${item.id}`, item.id, "AVAILABLE"));
  const all = rows({}, many, lots);

  it("pagina de a diez productos y cuenta productos y lotes", () => {
    const first = inventoryPage(all, 1);
    expect(first).toMatchObject({
      total: 23,
      lots: 23,
      totalPages: 3,
      currentPage: 1,
    });
    expect(first.rows).toHaveLength(10);
    expect(inventoryPage(all, 3).rows).toHaveLength(3);
  });

  it("se queda en la última página si los resultados bajan", () => {
    expect(inventoryPage(all.slice(0, 12), 3).currentPage).toBe(2);
  });

  it("devuelve una primera página vacía sin resultados", () => {
    expect(inventoryPage([], 2)).toEqual({
      total: 0,
      lots: 0,
      totalPages: 1,
      currentPage: 1,
      rows: [],
    });
  });
});

describe("inventoryStockProductOptions", () => {
  it("ofrece sólo productos con unidades, incluidos los que faltan en el catálogo", () => {
    const options = inventoryStockProductOptions(products, [
      ...stock,
      lot("Y-1", "otro", "AVAILABLE"),
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "Actron",
      "Alikal",
      "Buscapina",
      "Nombre otro",
    ]);
  });
});
