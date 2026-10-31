import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogReferenceRefresh } from "./catalog-reference-refresh";

it("keeps refresh in the header and places metrics above the catalog toolbar", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  const header = source.slice(
    source.indexOf("<header"),
    source.indexOf("</header>"),
  );
  expect(header).not.toContain("<ProductCatalogMetrics");
  expect(source.indexOf("<ProductCatalogMetrics")).toBeLessThan(
    source.indexOf("<ProductCatalogToolbar"),
  );
  expect(header).toMatch(/<CatalogReferenceRefresh\s+compact/);
  expect(header).toContain("<Package");
  expect(source).not.toContain("<ProductCatalogTitle");
});

it("keeps price reference details available on hover and keyboard focus", () => {
  const html = renderToStaticMarkup(
    <CatalogReferenceRefresh
      compact
      token="test"
      organizationId="test"
      products={[]}
      done={() => {}}
      error={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Actualizar precios de referencia"');
  expect(html).toContain('role="tooltip"');
  expect(html).toContain("group-focus-within:visible");
  expect(html).toContain("group-hover:visible");
  expect(html).toContain("Sin registro");
});
