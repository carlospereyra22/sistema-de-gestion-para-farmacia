import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InventoryStockTable } from "./inventory-stock-table";
import { InventoryToolbar } from "./inventory-toolbar";
import type { CatalogProduct, StockLot } from "./lib/api";
import { emptyInventoryFilters, inventoryRows } from "./lib/inventory-products";

const product = {
  id: "product",
  name: "Loratadina",
  active: true,
  barcodes: [],
  laboratory: { id: "lab", name: "Laboratorio Beta" },
  presentation: "10 comprimidos",
  saleUnit: "BOX",
} as unknown as CatalogProduct;
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
const expired: StockLot = {
  ...lot,
  id: "expired",
  number: "VIEJO",
  quantity: 4,
  sellableQuantity: 0,
  expiredQuantity: 4,
  expiryStatus: "EXPIRED",
  expiresAt: "2026-01-10T00:00:00.000Z",
};

function render(
  lots: StockLot[],
  lotQuery = "",
  products: CatalogProduct[] = [product],
) {
  return renderToStaticMarkup(
    <InventoryStockTable
      rows={inventoryRows(products, lots, {
        ...emptyInventoryFilters,
        lot: lotQuery,
      })}
      lotQuery={lotQuery}
      token="fixture"
      organizationId="org"
      branchId="branch"
      done={() => {}}
      onAdjust={() => {}}
      onReceive={() => {}}
      onReturn={() => {}}
    />,
  );
}

it("muestra una fila por producto con lotes, stock, vendibles y próximo vencimiento", () => {
  const html = render([lot, expired]);
  expect(html).toContain('aria-label="Existencias por producto"');
  for (const heading of [
    "Producto",
    "Lotes",
    "Stock",
    "Vendibles",
    "Próx. venc.",
    "Estado",
  ])
    expect(html).toContain(heading);
  expect(html.match(/Loratadina<\/span>/g)).toHaveLength(1);
  expect(html).toContain("Laboratorio Beta · 10 comprimidos · Caja");
  expect(html).toContain(">16<");
  expect(html).toContain(">12<");
  expect(html).toContain("30/5/2027");
  expect(html).toContain("1 lote vencido");
});

it("arranca con los lotes cerrados y un botón accesible para verlos", () => {
  const html = render([lot]);
  expect(html).toContain('aria-label="Ver lotes de Loratadina"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('aria-label="Lotes de Loratadina"');
});

it("al buscar por lote abre el producto con ese lote y sus acciones", () => {
  const html = render([lot, expired], "abc");
  expect(html).toContain('aria-label="Ocultar lotes de Loratadina"');
  expect(html).toContain('aria-label="Lotes de Loratadina"');
  expect(html).toContain("ABC");
  expect(html).not.toContain("VIEJO");
  expect(html).toContain("1 lote más no se muestra por los filtros.");
  expect(html).toContain('aria-label="Editar lote ABC de Loratadina"');
  expect(html).toContain('aria-label="Recibir lote ABC de Loratadina"');
  expect(html).toContain('aria-label="Ajustar lote ABC de Loratadina"');
  expect(html).toContain('aria-label="Devolver lote ABC de Loratadina"');
});

it("un producto sin stock no ofrece desplegar lotes", () => {
  const html = render([]);
  expect(html).toContain("Sin stock");
  expect(html).toContain("—");
  expect(html).not.toContain("lotes de Loratadina");
});

it("conserva el nombre de lotes sin ficha en el catálogo sin inventar datos", () => {
  const html = render([{ ...lot, expiresAt: null }], "", []);
  expect(html).toContain("Loratadina");
  expect(html).toContain("Sin fecha");
  expect(html).not.toContain("Laboratorio Beta");
});

it("la barra tiene buscador general, buscador por lote, filtros y contador", () => {
  const html = renderToStaticMarkup(
    <InventoryToolbar
      filters={emptyInventoryFilters}
      products={1}
      lots={3}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Buscar en inventario"');
  expect(html).toContain("código de barras");
  expect(html).toContain('aria-label="Buscar por lote"');
  expect(html).toContain('aria-label="Stock"');
  expect(html).toContain('aria-label="Vencimiento"');
  expect(html).toContain("1 producto");
  expect(html).toContain("3 lotes");
  expect(html).toContain("disabled");
});

it("muestra la tabla con la escala grande", () => {
  const html = render([lot]);
  expect(html).toContain("w-full text-base");
  expect(html).toContain("bg-[#f3f7f8] text-sm");
  expect(html).toContain("mt-0.5 block text-sm text-slate-500");
  expect(html).not.toContain("text-xs");
});
