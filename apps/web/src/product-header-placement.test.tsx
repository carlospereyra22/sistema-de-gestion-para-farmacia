import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogUpdateStatusView } from "./catalog-update-status";

it("deja sólo el aviso de actualización en el encabezado y las métricas sobre la barra", () => {
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
  expect(header).toContain("<CatalogUpdateStatus");
  expect(source).not.toContain("CatalogReferenceRefresh");
  expect(header).toContain("<Package");
  expect(source).not.toContain("<ProductCatalogTitle");
});

it("mantiene el detalle de la base disponible con el mouse y con el teclado", () => {
  const html = renderToStaticMarkup(<CatalogUpdateStatusView />);
  expect(html).toContain('role="tooltip"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain("group-focus-within:visible");
  expect(html).toContain("group-hover:visible");
  expect(html).toContain("Sin registro");
});
