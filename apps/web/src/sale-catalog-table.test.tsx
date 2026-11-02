import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "./lib/api";
import { SaleCatalogTable } from "./sale-catalog-table";

const product = (
  id: string,
  name: string,
  extra: Partial<CatalogProduct> = {},
): CatalogProduct =>
  ({
    id,
    name,
    activeIngredient: null,
    concentration: null,
    pharmaceuticalForm: null,
    presentation: null,
    barcodes: [],
    category: null,
    prices: [{ amountMinor: "578000" }],
    ...extra,
  }) as CatalogProduct;

const render = (selectedId?: string) =>
  renderToStaticMarkup(
    <SaleCatalogTable
      idPrefix="catalogo"
      selectedId={selectedId}
      onSelect={() => {}}
      onAdd={() => {}}
      rows={[
        {
          product: product("p1", "Omeprazol 20 mg", {
            activeIngredient: "Omeprazol",
            pharmaceuticalForm: "Cápsulas",
            category: { id: "c1", name: "Gastro" },
          }),
          available: 41,
          expired: 0,
        },
        { product: product("p2", "Loratadina"), available: 3, expired: 0 },
        {
          product: product("p3", "Ibuprofeno", { prices: [] }),
          available: 0,
          expired: 16,
        },
      ]}
    />,
  );

it("renders an accessible catalog grid with category, stock and price", () => {
  const html = render();
  expect(html).toContain('aria-label="Catálogo de productos"');
  expect(html).toContain('role="grid"');
  expect(html).toContain("Omeprazol · Cápsulas");
  expect(html).toContain("Gastro");
  expect(html).toContain('aria-label="Omeprazol 20 mg, 41 disponibles, $');
  expect(html).toContain("Sin detalle farmacéutico");
});

it("flags low stock, no stock and expired units", () => {
  const html = render();
  expect(html).toContain("text-amber-700");
  expect(html).toContain("Sin stock");
  expect(html).toContain("16 vencidas · no vendibles");
  expect(html).toContain("Ibuprofeno, sin stock, sin precio");
});

it("marks the selected row", () => {
  const html = render("p2");
  expect(html).toContain('id="catalogo-p2" aria-selected="true"');
  expect(html).toContain('id="catalogo-p1" aria-selected="false"');
  expect(html).toContain("shadow-[inset_3px_0_0_#0d9488]");
});

it("explains an empty search", () => {
  const html = renderToStaticMarkup(
    <SaleCatalogTable
      idPrefix="catalogo"
      rows={[]}
      hiddenCount={0}
      onSelect={() => {}}
      onAdd={() => {}}
    />,
  );
  expect(html).toContain("No hay productos para esta búsqueda.");
});
