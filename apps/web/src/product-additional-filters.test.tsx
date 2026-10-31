import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProductAdditionalFilters } from "./product-additional-filters";
import { emptyCatalogAdditionalFilters } from "./lib/catalog-additional-filters";
it("groups additional options in a fixed dialog without expanding dropdowns", () => {
  const html = renderToStaticMarkup(
    <ProductAdditionalFilters
      value={emptyCatalogAdditionalFilters}
      onApply={() => undefined}
      onClose={() => undefined}
    />,
  );
  expect(html).toContain("<dialog");
  expect(html.match(/type="radio"/g)).toHaveLength(9);
  expect(html).toContain("Aplicar filtros");
  expect(html).toContain("Cancelar");
  expect(html).toContain("Limpiar adicionales");
  expect(html).not.toContain('aria-label="Filtrar por marca"');
  expect(html).toContain('aria-label="Filtrar por tipo de producto"');
});
