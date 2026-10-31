import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProductCatalogMetrics,
  ProductCatalogTitle,
} from "./product-catalog-header";
import { ProductCatalogToolbar } from "./product-catalog-toolbar";

describe("product catalog header", () => {
  it("uses physical stock for existing no-stock count and sellable quantities for the agreed low-stock threshold", () => {
    const html = renderToStaticMarkup(
      <ProductCatalogMetrics
        products={[
          { id: "a", active: true },
          { id: "b", active: true },
          { id: "c", active: true },
          { id: "d", active: false },
          { id: "e", active: true },
        ]}
        stock={[
          { productId: "b", quantity: 20, sellableQuantity: 0 },
          { productId: "c", quantity: 5, sellableQuantity: 5 },
          { productId: "d", quantity: 1, sellableQuantity: 1 },
          { productId: "e", quantity: 6, sellableQuantity: 6 },
        ]}
      />,
    );
    expect(html).toMatch(/>5<\/p>.*?Total de productos/);
    expect(html).toMatch(/>4<\/p>.*?Activos/);
    expect(html).toMatch(/>1<\/p>.*?Sin stock/);
    expect(html).toMatch(/>1<\/p>.*?Stock bajo/);
  });
  it("provides one title, accessible filters and the existing create action", () => {
    expect(renderToStaticMarkup(<ProductCatalogTitle />)).toContain("<h1");
    const html = renderToStaticMarkup(
      <ProductCatalogToolbar
        filters={{
          query: "",
          category: "",
          laboratory: "",
          status: "",
          stock: "",
          expiry: "",
          reference: "",
        }}
        onChange={() => {}}
        onAdditionalChange={() => {}}
      />,
    );
    for (const label of [
      "Buscar productos",
      "Categoría",
      "Laboratorio",
      "Estado",
      "Stock",
      "Vencimiento",
    ])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/role="combobox"/g)).toHaveLength(5);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Más filtros");
    expect(html).not.toContain("Nuevo producto");
    expect(html.indexOf('aria-haspopup="dialog"')).toBeGreaterThan(
      html.indexOf('aria-label="Vencimiento"'),
    );
    expect(html).toContain('aria-expanded="false"');
  });
});
