import { describe, expect, it } from "vitest";
import {
  invoiceMapping,
  invoiceSheet,
  invoiceTextLines,
  parseInvoiceLine,
  parseInvoiceLines,
} from "./purchase-invoice-pdf";
import { previewPurchaseExcel } from "./purchase-excel";
import type { CatalogProduct } from "./api";

// Renglones tal como salen del texto de las facturas reales.
const monroe = [
  "Código de Barra Descripción Gravado Cantidad Pcio Púb./Sug. Margen S/PVP% %OF. Precio Unitario Importe Pesos",
  "* Productos entregados en Remito 46777",
  "## Éticos ##",
  "7795371459115 DICLOGESIC PLUS B12 COM.RE X10 3 13.000,00 48,30 25,00 6.724,14 20.172,42",
  "7795378001072 MIGRAL COMPOSITUM COMPR. X100 1 59.119,40 31,05 40.784,23 40.784,23",
  "7793640992769 ACTRON NF 400MG CAP.BL X20 10 8.275,00 31,05 5.708,61 57.086,12",
  "3664798065213 BUSCAPINA DUO COM.RE X10X10 BLISTER 5 112.780,00 40,00 13,00 67.668,00 338.340,00",
  "Total de Líneas: 7 - Total de Unidades: 27",
  "C.A.E. Nro.: 86440277225035",
];
const delSud = [
  "UNIDAD DESCRIPCIÓN CÓDIGO PRECIO S / DTO. DTO NETO UNIT. TOTAL",
  "ING. BRUTOS: 20247237837 GLN: 0000000000000 HOJA 1 DE 1",
  "INICIO DE ACTIVIDADES: 12/2003 GLN: 7798169400047",
  "2 VICK VITAP FORTE MIEL Y LIM 5 GR 50 SOB E * # 7500435221399 149.999,99 44,80 % 82.764,00 165.527,99",
  "2 MENACOR OMEGA 3 CON 30 CAPS SUP DIE G* 7798008191792 69.500,00 41,40 % 33.672,51 67.345,02",
  "4 TOTAL 247.015,46",
];

describe("parseInvoiceLines", () => {
  it("lee la factura de Monroe (código primero, importe al final)", () => {
    expect(
      parseInvoiceLines(monroe).map(({ code, name, quantity, cost }) => [
        code,
        name,
        quantity,
        cost,
      ]),
    ).toEqual([
      ["7795371459115", "DICLOGESIC PLUS B12 COM.RE X10", 3, 6724.14],
      ["7795378001072", "MIGRAL COMPOSITUM COMPR. X100", 1, 40784.23],
      ["7793640992769", "ACTRON NF 400MG CAP.BL X20", 10, 5708.61],
      ["3664798065213", "BUSCAPINA DUO COM.RE X10X10 BLISTER", 5, 67668],
    ]);
  });

  it("lee la factura de Del Sud (cantidad primero, código al medio)", () => {
    expect(
      parseInvoiceLines(delSud).map(({ code, name, quantity, cost }) => [
        code,
        name,
        quantity,
        cost,
      ]),
    ).toEqual([
      ["7500435221399", "VICK VITAP FORTE MIEL Y LIM 5 GR 50 SOB", 2, 82764],
      ["7798008191792", "MENACOR OMEGA 3 CON 30 CAPS SUP DIE", 2, 33672.51],
    ]);
  });

  it("deja para revisar un renglón con precios que no cierran la cuenta", () => {
    expect(
      parseInvoiceLine("7790001000011 PRODUCTO X 3 1.000,00 2.500,00"),
    ).toMatchObject({ code: "7790001000011", quantity: null, cost: null });
  });
});

describe("invoiceTextLines", () => {
  it("une los textos de la misma altura y los ordena de izquierda a derecha", () => {
    expect(
      invoiceTextLines([
        { str: "3", x: 300, y: 500 },
        { str: "7795371459115", x: 20, y: 500.8 },
        { str: "Factura", x: 20, y: 700 },
        { str: "DICLOGESIC", x: 80, y: 499.5 },
      ]),
    ).toEqual(["Factura", "7795371459115 DICLOGESIC 3"]);
  });
});

describe("invoiceSheet", () => {
  it("pasa los renglones a la revisión de compras", () => {
    const sheet = invoiceSheet(parseInvoiceLines(delSud));
    const rows = previewPurchaseExcel(sheet, -1, invoiceMapping, [
      {
        id: "vick",
        name: "Vick Vitapyrena",
        active: true,
        barcodes: [{ code: "7500435221399" }],
      } as unknown as CatalogProduct,
    ]);
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      productId: "vick",
      quantity: "2",
      cost: "82764.00",
      issue: null,
    });
    expect(rows[1]).toMatchObject({ quantity: "2", cost: "33672.51" });
  });
});
