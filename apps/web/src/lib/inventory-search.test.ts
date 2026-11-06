import { describe, expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./api";
import {
  filterInventoryOptions,
  findScannedProduct,
  inventoryEnterOption,
  inventoryLotChoice,
  inventoryProductDetail,
  NO_SUPPLIER,
  inventoryDefaultReturnSupplier,
  inventoryProductOption,
  inventoryReturnSuppliers,
  inventoryAdjustSuppliers,
  inventoryDefaultAdjustSupplier,
  lotHasSupplierRows,
  lotStockOrigins,
  lotSupplierSummary,
  inventorySupplierOption,
  scanAutoDelay,
} from "./inventory-search";
function product(id: string, laboratory: string, code: string): CatalogProduct {
  return {
    id,
    name: "Loratadina",
    laboratory: { id: laboratory, name: laboratory },
    activeIngredient: "Loratadina",
    concentration: "10 mg",
    presentation: "10 comprimidos",
    saleUnit: "BOX",
    barcodes: [{ code }],
    active: true,
  } as CatalogProduct;
}
const a = product("a", "Laboratorio Álvarez", "779000000001");
const b = product("b", "Laboratorio Beta", "779000000002");
const options = [a, b].map(inventoryProductOption);
it("distinguishes the same medicine by laboratory, without merging product IDs", () => {
  expect(filterInventoryOptions(options, "loratadina")).toHaveLength(2);
  expect(filterInventoryOptions(options, "ALVAREZ lora")).toEqual([options[0]]);
  expect(filterInventoryOptions(options, "beta 10 comprimidos")).toEqual([
    options[1],
  ]);
  expect(inventoryProductDetail(a)).toContain("Laboratorio Álvarez");
  expect(inventoryProductDetail(b)).toContain("Laboratorio Beta");
});
it("searches all barcodes and pharmaceutical details, ignoring accents and word order", () => {
  const item = inventoryProductOption({
    ...a,
    name: "Marca",
    activeIngredient: "Cetirizina",
    pharmaceuticalForm: "Solución",
    barcodes: [{ code: "primary" }, { code: "SG123456789012" }],
  });
  expect(filterInventoryOptions([item], "solucion CETIRI")).toEqual([item]);
  expect(filterInventoryOptions([item], "SG123456789012")).toEqual([item]);
  expect(filterInventoryOptions(options, "779000000002")).toEqual([options[1]]);
  expect(filterInventoryOptions(options, "nada")).toEqual([]);
  expect(filterInventoryOptions(options, "   ")).toEqual(options);
});
it("distingue los lotes de un producto por número, unidades y vencimiento", () => {
  const lot = {
    id: "lot-a",
    productId: a.id,
    productName: a.name,
    number: "ABC123",
    quantity: 4,
    expiresAt: "2026-01-01",
    unitCostMinor: "100",
    metadataVersion: 0,
    sellableQuantity: 0,
    expiredQuantity: 4,
    expiryStatus: "EXPIRED",
  } satisfies StockLot;
  const result = inventoryLotChoice(lot);
  const other = inventoryLotChoice({ ...lot, id: "lot-b", number: "XYZ" });
  expect(filterInventoryOptions([result, other], "abc123")).toEqual([result]);
  expect(result.label).toBe("Lote ABC123");
  expect(result.detail).toBe("4 un. · Vence 1/1/2026 · Vencido");
  expect(
    inventoryLotChoice({ ...lot, expiresAt: null, expiryStatus: "AVAILABLE" })
      .detail,
  ).toBe("4 un. · Sin vencimiento");
});
it("does not guess a laboratory or lot on Enter when matches are ambiguous", () => {
  expect(inventoryEnterOption(options, -1)).toBeUndefined();
  expect(inventoryEnterOption(options, 1)).toEqual(options[1]);
  expect(inventoryEnterOption([options[0]!], -1)).toEqual(options[0]);
  expect(inventoryEnterOption([], -1)).toBeUndefined();
});
it("shows missing laboratory explicitly without inventing product data", () => {
  expect(inventoryProductDetail({ ...a, laboratory: null })).toContain(
    "Sin laboratorio",
  );
  expect(inventoryProductDetail()).toBe("");
});

describe("escáner sin Enter", () => {
  const products = [
    { id: "corto", barcodes: [{ code: "12345678" }] },
    { id: "largo", barcodes: [{ code: "7896902211124" }] },
  ];

  it("encuentra el código exacto, dentro de un QR y como GTIN de 14 dígitos", () => {
    expect(findScannedProduct(products, " 7896902211124 ")?.id).toBe("largo");
    expect(
      findScannedProduct(products, "https://x.ar/01/7896902211124")?.id,
    ).toBe("largo");
    expect(findScannedProduct(products, "07896902211124")?.id).toBe("largo");
    expect(findScannedProduct(products, "789690")).toBeUndefined();
  });

  it("procesa rápido lo encontrado y espera más para avisar que no existe", () => {
    expect(scanAutoDelay(true, "12345678")).toBe(250);
    expect(scanAutoDelay(false, "99999999")).toBe(1000);
  });

  it("no hace nada mientras el texto es corto o está vacío", () => {
    expect(scanAutoDelay(false, "1234567")).toBeNull();
    expect(scanAutoDelay(false, "   ")).toBeNull();
  });
});

it("al devolver ofrece los proveedores del lote y, sin datos, todos", () => {
  const all = [
    inventorySupplierOption({ id: "a", name: "Droguería A" }),
    inventorySupplierOption({ id: "b", name: "Droguería B" }),
  ];
  const known = { suppliers: [{ id: "b", name: "Droguería B", quantity: 41 }] };
  expect(inventoryReturnSuppliers(known, all)).toEqual([
    expect.objectContaining({ value: "b", detail: "41 un. de este lote" }),
  ]);
  expect(
    inventoryReturnSuppliers({ suppliers: [] }, all).map((o) => o.value),
  ).toEqual([NO_SUPPLIER, "a", "b"]);
  expect(inventoryReturnSuppliers(undefined, all)).toBe(all);
});

it("con stock sin proveedor suma al resto de los proveedores", () => {
  const all = [
    inventorySupplierOption({ id: "a", name: "A" }),
    inventorySupplierOption({ id: "b", name: "B" }),
  ];
  const lot = {
    suppliers: [{ id: "b", name: "B", quantity: 1 }],
    unassignedQuantity: 40,
  };
  expect(inventoryReturnSuppliers(lot, all).map((o) => o.value)).toEqual([
    "b",
    NO_SUPPLIER,
    "a",
  ]);
  expect(lotHasSupplierRows(lot)).toBe(true);
  expect(lotHasSupplierRows({ ...lot, unassignedQuantity: 0 })).toBe(false);
  expect(lotSupplierSummary(lot)).toBe("B · 1 un. / Sin proveedor · 40 un.");
});

describe("proveedor al ajustar", () => {
  const all = [
    inventorySupplierOption({ id: "a", name: "A" }),
    inventorySupplierOption({ id: "b", name: "B" }),
  ];
  const lot = {
    suppliers: [
      { id: "a", name: "A", quantity: 0 },
      { id: "b", name: "B", quantity: 2 },
    ],
    unassignedQuantity: 3,
  };

  it("al restar ofrece sólo quien tiene unidades, con cuántas", () => {
    expect(
      inventoryAdjustSuppliers(lot, all, "subtract").map((option) => [
        option.value,
        option.detail,
      ]),
    ).toEqual([
      ["b", "2 un. de este lote"],
      [NO_SUPPLIER, "3 un. de este lote"],
    ]);
  });
  it("al sumar ofrece Sin proveedor y todos los proveedores", () => {
    expect(
      inventoryAdjustSuppliers(lot, all, "add").map((option) => option.value),
    ).toEqual([NO_SUPPLIER, "a", "b"]);
  });
  it("sin lote no ofrece nada", () => {
    expect(inventoryAdjustSuppliers(undefined, all, "add")).toEqual([]);
  });
  it("elige solo cuando hay un único origen", () => {
    expect(inventoryDefaultAdjustSupplier(undefined)).toBe("");
    expect(inventoryDefaultAdjustSupplier(lot)).toBe("");
    expect(
      inventoryDefaultAdjustSupplier({ ...lot, unassignedQuantity: 0 }),
    ).toBe("b");
    expect(inventoryDefaultAdjustSupplier({ unassignedQuantity: 3 })).toBe(
      NO_SUPPLIER,
    );
  });
});

describe("lotStockOrigins", () => {
  const juan = { id: "a", name: "juan", quantity: 0 };
  const carlos = { id: "b", name: "carlos", quantity: 2 };

  it("deja sólo lo que el lote tiene hoy, con Sin proveedor al final", () => {
    expect(
      lotStockOrigins({ suppliers: [juan, carlos], unassignedQuantity: 34 }),
    ).toEqual([
      { key: "b", name: "carlos", quantity: 2, supplier: carlos },
      { key: NO_SUPPLIER, name: "Sin proveedor", quantity: 34, supplier: null },
    ]);
  });
  it("incluye el stock sin proveedor aunque no haya proveedores conocidos", () => {
    expect(
      lotStockOrigins({ unassignedQuantity: 401 }).map((row) => row.name),
    ).toEqual(["Sin proveedor"]);
    expect(lotStockOrigins({})).toEqual([]);
  });
  it("con un solo origen restante no pide renglones", () => {
    const lot = { suppliers: [juan], unassignedQuantity: 34 };
    expect(lotHasSupplierRows(lot)).toBe(false);
    expect(lotSupplierSummary(lot)).toBe("Sin proveedor · 34 un.");
  });
  it("sin proveedores conocidos no agrega aclaración", () => {
    expect(lotSupplierSummary({ unassignedQuantity: 401 })).toBe("");
  });
});

it("elige solo el proveedor del lote cuando no hay nada que decidir", () => {
  const supplier = { id: "a", name: "A", quantity: 1 };
  expect(inventoryDefaultReturnSupplier(undefined)).toBe("");
  expect(inventoryDefaultReturnSupplier({ suppliers: [] })).toBe(NO_SUPPLIER);
  expect(inventoryDefaultReturnSupplier({ suppliers: [supplier] })).toBe("a");
  expect(
    inventoryDefaultReturnSupplier({ suppliers: [supplier, supplier] }),
  ).toBe("");
});

it("no ofrece a un proveedor al que ya se le devolvió todo", () => {
  const lot = {
    suppliers: [
      { id: "a", name: "A", quantity: 0 },
      { id: "b", name: "B", quantity: 3 },
    ],
    unassignedQuantity: 0,
  };
  expect(inventoryReturnSuppliers(lot, []).map((o) => o.value)).toEqual(["b"]);
  expect(inventoryDefaultReturnSupplier(lot)).toBe("b");
  const empty = {
    suppliers: [{ id: "a", name: "A", quantity: 0 }],
    unassignedQuantity: 38,
  };
  expect(inventoryReturnSuppliers(empty, []).map((o) => o.value)).toEqual([
    NO_SUPPLIER,
  ]);
  expect(inventoryDefaultReturnSupplier(empty)).toBe(NO_SUPPLIER);
});
