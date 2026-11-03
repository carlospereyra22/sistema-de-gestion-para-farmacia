import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "./api";
import {
  detectExcelHeader,
  parseExcelCost,
  parseExcelQuantity,
  previewPurchaseExcel,
  purchaseExcelLines,
} from "./purchase-excel";

const product = (
  id: string,
  name: string,
  codes: string[] = [],
  extra: Partial<CatalogProduct> = {},
) =>
  ({
    id,
    name,
    active: true,
    barcodes: codes.map((code) => ({ code })),
    ...extra,
  }) as unknown as CatalogProduct;

const catalogo = [
  product("uvasal", "Uvasal", ["7790001000011"]),
  product("uvasal-limon", "Uvasal Limón", ["7790001000028"]),
  product("ibu-1", "Ibuprofeno 400", []),
  product("ibu-2", "Ibuprofeno 400", []),
  product("baja", "Producto de baja", ["7790001000035"], { active: false }),
];

describe("detectExcelHeader", () => {
  it("encuentra el encabezado debajo de las filas de la droguería", () => {
    const data = [
      ["Droguería del Sur", null, null, null],
      ["Pedido 1234", null, null, null],
      ["Cód. Barra", "Descripción", "Cant. pedida", "Precio unitario"],
      ["7790001000011", "UVASAL", 2, 1200],
    ];
    expect(detectExcelHeader(data)).toEqual({
      headerRow: 2,
      mapping: { code: 0, name: 1, quantity: 2, cost: 3 },
    });
  });
});

describe("detectExcelHeader con el detalle de factura de una droguería", () => {
  // Misma forma que el "details.xlsx" real: cabecera de la factura arriba y
  // renglones de productos más abajo, con "Código Iva" y "Producto Cód.".
  const data = [
    [
      "Tipo Reg.",
      "Cod. Cliente",
      "Comprobante",
      "Comprobante Nro",
      "Nombre Cliente",
      "Código",
      "Código Cliente",
      "Neto Gravado",
      "Exento",
      "Iva",
    ],
    [
      "C",
      40517,
      "A",
      "0317A0003",
      "FCIA JUNCOS",
      0,
      "W51222",
      67345.02,
      165528,
      14142.45,
    ],
    [],
    [],
    [
      "Sección",
      "Item",
      "Producto Cód.",
      "Producto Descripción",
      "Producto Código",
      "Tipo de Venta",
      "Tipo de Oferta",
      "Código Iva",
      "Cantidad",
      "Precio Unitario",
      "Precio Público",
      "Precio Total",
      "Motivo",
    ],
    [
      "ME",
      20,
      7500435221399,
      "VICK VITAPYRENA FORTE",
      1010,
      null,
      "N",
      0,
      2,
      82764,
      150000,
      165528,
      "WEB",
    ],
    [
      "NM",
      21,
      7798008191792,
      "MENACOR 10 MG",
      1020,
      null,
      "N",
      1,
      2,
      33672.51,
      69500,
      67345.02,
      "WEB",
    ],
  ];

  it("toma el código de barras y la descripción por su contenido", () => {
    expect(detectExcelHeader(data)).toEqual({
      headerRow: 4,
      mapping: { code: 2, name: 3, quantity: 8, cost: 9 },
    });
  });

  it("asocia por código de barras aunque la celda sea numérica", () => {
    const { headerRow, mapping } = detectExcelHeader(data);
    const rows = previewPurchaseExcel(data, headerRow, mapping, [
      product("vick", "Vick Vitapyrena", ["7500435221399"]),
    ]);
    expect(rows.map((r) => [r.rowNumber, r.code, r.name, r.productId])).toEqual(
      [
        [6, "7500435221399", "VICK VITAPYRENA FORTE", "vick"],
        [7, "7798008191792", "MENACOR 10 MG", null],
      ],
    );
  });
});

describe("detectExcelHeader con el pedido simple de otra droguería", () => {
  it("lee código, nombre y cantidad pedida aunque no traiga costo", () => {
    const data = [
      [
        "codigo barra",
        "nombre",
        "estado",
        "cant pedida",
        "cant aprobada",
        "nro pedido int",
        "entrega",
      ],
      [
        7791763000088,
        "DERMOPER CRE.FL X100G",
        "Ingresado",
        1,
        1,
        "Posadas 19/10 #676",
        "Posadas",
      ],
      [
        7798140257691,
        "TAFIROL PLUS CAP.BL X24",
        "Ingresado",
        35,
        35,
        "Posadas 19/10 #676",
        "Posadas",
      ],
    ];
    const { headerRow, mapping } = detectExcelHeader(data);
    expect({ headerRow, mapping }).toEqual({
      headerRow: 0,
      mapping: { code: 0, name: 1, quantity: 3, cost: null },
    });
    const rows = previewPurchaseExcel(data, headerRow, mapping, [
      product("tafirol", "Tafirol Plus", ["7798140257691"]),
    ]);
    expect(rows[1]).toMatchObject({
      productId: "tafirol",
      quantity: "35",
      cost: "",
      issue: null,
    });
  });
});

describe("parseExcelQuantity", () => {
  it("acepta enteros positivos y separadores de miles", () => {
    expect(parseExcelQuantity(12)).toBe("12");
    expect(parseExcelQuantity("1.200")).toBe("1200");
    expect(parseExcelQuantity(" 3 ")).toBe("3");
  });

  it("descarta decimales, ceros y texto", () => {
    expect(parseExcelQuantity(1.5)).toBe("");
    expect(parseExcelQuantity("0")).toBe("");
    expect(parseExcelQuantity("dos")).toBe("");
    expect(parseExcelQuantity(null)).toBe("");
  });
});

describe("parseExcelCost", () => {
  it("lee importes con formato argentino como texto", () => {
    expect(parseExcelCost("$ 1.234,56")).toBe("1234.56");
    expect(parseExcelCost("1.234")).toBe("1234.00");
    expect(parseExcelCost("ARS 99,9")).toBe("99.90");
  });

  it("lee celdas numéricas sin confundir decimales con miles", () => {
    expect(parseExcelCost(1200)).toBe("1200.00");
    expect(parseExcelCost(12.3456)).toBe("12.35");
    expect(parseExcelCost(0.5)).toBe("0.50");
  });

  it("descarta texto que no es importe", () => {
    expect(parseExcelCost("consultar")).toBe("");
    expect(parseExcelCost(-5)).toBe("");
  });
});

describe("previewPurchaseExcel", () => {
  const mapping = { code: 0, name: 1, quantity: 2, cost: 3 };

  it("asocia por código, por nombre exacto y marca lo dudoso", () => {
    const data = [
      ["Código", "Producto", "Cantidad", "Costo"],
      ["7790001000011", "UVASAL SOBRES", 2, 1200],
      ["", "uvasal limon", "3", "1.500,00"],
      ["", "IBUPROFENO 400", 1, 900],
      ["7799999999999", "Producto nuevo", 4, 100],
      ["7790001000035", "Producto de baja", 1, 100],
      ["", "Uvasal", "", 100],
      [null, null, null, null],
    ];
    const rows = previewPurchaseExcel(data, 0, mapping, catalogo);

    expect(
      rows.map((r) => [r.rowNumber, r.productId, r.matchedBy, r.issue]),
    ).toEqual([
      [2, "uvasal", "code", null],
      [3, "uvasal-limon", "name", null],
      [4, null, null, "Coincidencia ambigua"],
      [5, null, null, "Elegí un producto"],
      [6, null, null, "Elegí un producto"],
      [7, "uvasal", "name", "Cantidad inválida o vacía"],
    ]);
    expect(rows[1]).toMatchObject({ quantity: "3", cost: "1500.00" });
  });

  it("reconoce el GTIN con o sin ceros a la izquierda (14 dígitos de ANMAT)", () => {
    const rows = previewPurchaseExcel(
      [
        ["07795312109383", "Buscapina Duo", 1, 10],
        ["7798140257691", "Tafirol Plus", 1, 10],
      ],
      -1,
      mapping,
      [
        product("buscapina", "Buscapina Duo", ["7795312109383"]),
        product("tafirol", "Tafirol Plus", ["07798140257691"]),
      ],
    );
    expect(rows.map((r) => r.productId)).toEqual(["buscapina", "tafirol"]);
  });

  it("no usa el nombre cuando el código de barras no existe en el catálogo", () => {
    const rows = previewPurchaseExcel(
      [["7799999999999", "Uvasal", 1, 10]],
      -1,
      mapping,
      catalogo,
    );
    expect(rows[0].productId).toBeNull();
  });

  it("avisa cuando el costo no se puede leer", () => {
    const rows = previewPurchaseExcel(
      [["7790001000011", "Uvasal", 1, "consultar"]],
      -1,
      mapping,
      catalogo,
    );
    expect(rows[0]).toMatchObject({ cost: "", issue: "Costo para revisar" });
  });
});

describe("purchaseExcelLines", () => {
  const rows = previewPurchaseExcel(
    [
      ["7790001000011", "Uvasal", 2, 1200],
      ["", "Ibuprofeno 400", 1, 900],
      ["7790001000028", "Uvasal limón", 5, 1300],
    ],
    -1,
    { code: 0, name: 1, quantity: 2, cost: 3 },
    catalogo,
  );

  it("usa las filas elegidas y los productos vinculados a mano", () => {
    const lines = purchaseExcelLines(rows, new Set([1, 2]), { 2: "ibu-2" }, []);
    expect(lines).toEqual([
      { productId: "uvasal", quantity: "2", cost: "1200.00" },
      { productId: "ibu-2", quantity: "1", cost: "900.00" },
    ]);
  });

  it("no duplica productos que ya están en el pedido", () => {
    const lines = purchaseExcelLines(rows, new Set([1, 2, 3]), {}, [
      { productId: "uvasal", quantity: "1", cost: "" },
    ]);
    expect(lines.map((l) => l.productId)).toEqual(["uvasal-limon"]);
  });
});
