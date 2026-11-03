import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProductCatalogMetrics,
  ProductCatalogTitle,
} from "./product-catalog-header";
import { ProductCatalogToolbar } from "./product-catalog-toolbar";

describe("product catalog header", () => {
  it("muestra sin stock, stock bajo, por vencer y vencidos como botones de filtro", () => {
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
          {
            productId: "b",
            quantity: 20,
            sellableQuantity: 0,
            expiryStatus: "EXPIRED",
          },
          {
            productId: "c",
            quantity: 5,
            sellableQuantity: 5,
            expiryStatus: "EXPIRING_SOON",
          },
          {
            productId: "d",
            quantity: 1,
            sellableQuantity: 1,
            expiryStatus: "AVAILABLE",
          },
          {
            productId: "e",
            quantity: 6,
            sellableQuantity: 6,
            expiryStatus: "AVAILABLE",
          },
        ]}
        selected="low"
        onSelect={() => undefined}
      />,
    );
    expect(html).not.toContain("Total de productos");
    expect(html).not.toContain("Activos");
    for (const label of ["Sin stock", "Stock bajo", "Por vencer", "Vencidos"])
      expect(html).toMatch(new RegExp(`>1</span>.*?${label}`));
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Stock bajo/);
  });
  const emptyFilters = {
    query: "",
    category: "",
    laboratory: "",
    status: "",
    stock: "",
    expiry: "",
    reference: "",
    lot: "",
  };
  it("muestra los cinco filtros principales y esconde el resto detrás de Más filtros", () => {
    expect(renderToStaticMarkup(<ProductCatalogTitle />)).toContain("<h1");
    const html = renderToStaticMarkup(
      <ProductCatalogToolbar
        filters={emptyFilters}
        onChange={() => {}}
        onAdditionalChange={() => {}}
      />,
    );
    for (const label of [
      "Buscar productos",
      "Buscar por lote",
      "Categoría",
      "Laboratorio",
      "Estado",
      "Stock",
      "Vencimiento",
    ])
      expect(html).toContain(`aria-label="${label}"`);
    for (const label of ["Tipo", "Precio automático", "Foto"])
      expect(html).not.toContain(`aria-label="${label}"`);
    expect(html.match(/role="combobox"/g)).toHaveLength(5);
    expect(html).toMatch(/aria-expanded="false"[^>]*>.*?Más filtros/);
    expect(html).not.toContain("<select");
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Nuevo producto");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Limpiar filtros/);
  });
  it("con un filtro escondido activo arranca abierto y lo cuenta en Más filtros", () => {
    const html = renderToStaticMarkup(
      <ProductCatalogToolbar
        filters={emptyFilters}
        additional={{ reference: "", image: "without", barcode: "" }}
        onChange={() => {}}
        onAdditionalChange={() => {}}
      />,
    );
    expect(html.match(/role="combobox"/g)).toHaveLength(9);
    expect(html).toMatch(
      /aria-expanded="true"[^>]*>.*?Menos filtros.*?>1<\/span>/,
    );
    expect(html).toContain('aria-label="Código de barras"');
  });
  it("habilita Limpiar filtros y cuenta búsqueda, filtros y adicionales", () => {
    const html = renderToStaticMarkup(
      <ProductCatalogToolbar
        filters={{ ...emptyFilters, lot: "L-23", stock: "low" }}
        additional={{ reference: "", image: "without", barcode: "" }}
        onChange={() => {}}
        onAdditionalChange={() => {}}
      />,
    );
    expect(html).not.toMatch(/disabled=""[^>]*>.*?Limpiar filtros/);
    expect(html).toMatch(/Limpiar filtros.*?>3<\/span>/);
  });
});
