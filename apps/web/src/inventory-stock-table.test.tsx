import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { CatalogProduct, StockLot } from "./lib/api";
import { InventoryStockTable } from "./inventory-stock-table";

const product = {
  id: "product",
  name: "Loratadina",
  laboratory: { id: "lab", name: "Laboratorio Beta" },
  presentation: "10 comprimidos",
  saleUnit: "BOX",
} as CatalogProduct;
const lot: StockLot = {
  id: "lot",
  productId: product.id,
  productName: product.name,
  number: "ABC",
  quantity: 12,
  sellableQuantity: 12,
  expiredQuantity: 0,
  expiryStatus: "AVAILABLE",
  expiresAt: "2027-05-30T00:00:00.000Z",
  unitCostMinor: "100",
  metadataVersion: 1,
};
function render(lots: StockLot[], products = new Map([[product.id, product]])) {
  return renderToStaticMarkup(
    <InventoryStockTable
      lots={lots}
      products={products}
      token="fixture"
      organizationId="org"
      branchId="branch"
      done={() => {}}
    />,
  );
}
it("groups lot information in accessible columns without repeating fully sellable stock", () => {
  const html = render([lot]);
  expect(html).toContain('aria-label="Existencias por lote"');
  for (const heading of [
    "Producto",
    "Lote",
    "Vencimiento",
    "Stock",
    "Acciones",
  ])
    expect(html).toContain(heading);
  expect(html).toContain("Loratadina");
  expect(html).toContain("Laboratorio Beta · 10 comprimidos · Caja");
  expect(html).toContain("30/5/2027");
  expect(html).toContain("12 ");
  expect(html).not.toContain("vendibles");
  expect(html).toContain('aria-label="Editar lote ABC de Loratadina"');
  expect(html).toContain('title="Editar lote, vencimiento y costo"');
  expect(html).not.toContain("Editar</button>");
});
it("keeps expiry warnings and physical versus sellable quantities visible", () => {
  const expired = {
    ...lot,
    expiryStatus: "EXPIRED" as const,
    sellableQuantity: 0,
    expiredQuantity: 12,
  };
  const html = render([
    expired,
    { ...lot, id: "soon", number: "DEF", expiryStatus: "EXPIRING_SOON" },
  ]);
  expect(html).toContain("Vencido · No vendible");
  expect(html).toContain("Próximo · Hasta 90 días");
  expect(html).toContain("0 vendibles");
  expect(html).toContain('aria-label="Editar lote DEF de Loratadina"');
  expect(expired.quantity).toBe(12);
  expect(expired.sellableQuantity).toBe(0);
});
it("retains historic product names and missing expiry without inventing catalog details", () => {
  const html = render([{ ...lot, expiresAt: null }], new Map());
  expect(html).toContain("Loratadina");
  expect(html).toContain("Sin fecha");
  expect(html).not.toContain("Laboratorio Beta");
});
