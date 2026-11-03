import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import { previewPurchaseExcel } from "./lib/purchase-excel";
import {
  invoiceMapping,
  invoiceSheet,
  parseInvoiceLines,
} from "./lib/purchase-invoice-pdf";
import {
  PurchaseExcelImport,
  PurchaseExcelReview,
} from "./purchase-excel-import";

const products = [
  {
    id: "uvasal",
    name: "Uvasal",
    active: true,
    barcodes: [{ code: "7790001000011" }],
  },
] as unknown as CatalogProduct[];
const data = [
  ["Código", "Descripción", "Cantidad", "Precio unitario"],
  ["7790001000011", "UVASAL", 2, 1200],
  ["", "UVASAL NARANJA X 10", 1, 1100],
];
const mapping = { code: 0, name: 1, quantity: 2, cost: 3 };
const noop = () => undefined;

describe("PurchaseExcelImport", () => {
  it("muestra el botón y acepta sólo Excel .xlsx", () => {
    const html = renderToStaticMarkup(
      <PurchaseExcelImport
        products={products}
        existingLines={[]}
        onImport={noop}
        onError={noop}
      />,
    );
    expect(html).toContain("Importar archivo");
    expect(html).toContain('aria-label="Excel o factura PDF de la droguería"');
    expect(html).toContain('accept=".xlsx,.pdf');
  });
});

describe("PurchaseExcelReview con producto inexistente", () => {
  it("ofrece crear el producto sólo en los renglones sin vincular", () => {
    const rows = previewPurchaseExcel(data, 0, mapping, products);
    const html = renderToStaticMarkup(
      <PurchaseExcelReview
        fileName="pedido.xlsx"
        sheetNames={["Pedido"]}
        sheetIndex={0}
        sheetData={data}
        headerRow={0}
        mapping={mapping}
        rows={rows}
        products={products}
        existingLines={[]}
        selected={new Set([2])}
        assigned={{}}
        onSheet={noop}
        onMapping={noop}
        onToggle={noop}
        onAssign={noop}
        onCreateProduct={() => Promise.resolve()}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain('aria-label="Crear producto UVASAL NARANJA X 10"');
    expect(html).not.toContain('aria-label="Crear producto UVASAL"');
  });
});

describe("PurchaseExcelReview de una factura PDF", () => {
  it("muestra renglones y unidades, sin elegir columnas", () => {
    const sheet = invoiceSheet(
      parseInvoiceLines([
        "7795371459115 DICLOGESIC PLUS B12 COM.RE X10 3 13.000,00 48,30 25,00 6.724,14 20.172,42",
        "3664798065213 BUSCAPINA DUO COM.RE X10X10 BLISTER 5 112.780,00 40,00 13,00 67.668,00 338.340,00",
      ]),
    );
    const html = renderToStaticMarkup(
      <PurchaseExcelReview
        source="pdf"
        fileName="FC-A-3146-00044507.pdf"
        sheetNames={["Factura"]}
        sheetIndex={0}
        sheetData={sheet}
        headerRow={-1}
        mapping={invoiceMapping}
        rows={previewPurchaseExcel(sheet, -1, invoiceMapping, products)}
        products={products}
        existingLines={[]}
        selected={new Set()}
        assigned={{}}
        onSheet={noop}
        onMapping={noop}
        onToggle={noop}
        onAssign={noop}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain("Revisar factura");
    expect(html).toContain("2 renglones · 8 unidades · 2 para revisar");
    expect(html).toContain("En la factura");
    expect(html).toContain("$ 6724,14");
    expect(html).toContain('<div hidden=""');
  });
});

describe("PurchaseExcelReview", () => {
  it("muestra filas asociadas y pide vincular las que no encontró", () => {
    const rows = previewPurchaseExcel(data, 0, mapping, products);
    const html = renderToStaticMarkup(
      <PurchaseExcelReview
        fileName="pedido-drogueria.xlsx"
        sheetNames={["Pedido"]}
        sheetIndex={0}
        sheetData={data}
        headerRow={0}
        mapping={mapping}
        rows={rows}
        products={products}
        existingLines={[]}
        selected={new Set([2])}
        assigned={{}}
        onSheet={noop}
        onMapping={noop}
        onToggle={noop}
        onAssign={noop}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(html).toContain("pedido-drogueria.xlsx · 2 filas · 1 para revisar");
    expect(html).toContain("Por código");
    expect(html).toContain("Elegí un producto");
    expect(html).toContain("Vincular");
    expect(html).toContain("A · Código");
    expect(html).toContain("Agregar 1 producto al pedido");
  });
});
