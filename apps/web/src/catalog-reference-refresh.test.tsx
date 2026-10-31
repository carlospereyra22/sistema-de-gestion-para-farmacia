import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { CatalogReferenceRefresh } from "./catalog-reference-refresh";

it("shows the latest valid review in Argentina time with an icon-only action", () => {
  const html = renderToStaticMarkup(
    <CatalogReferenceRefresh
      compact
      token="test"
      organizationId="org"
      done={() => undefined}
      error={() => undefined}
      products={[
        {
          externalReferenceSource: "official",
          externalReferenceName: "Uno",
          externalReferenceCheckedAt: "2026-10-22T20:00:00Z",
        },
        {
          externalReferenceSource: "official",
          externalReferenceName: "Dos",
          externalReferenceCheckedAt: "invalid",
        },
        {
          externalReferenceSource: null,
          externalReferenceName: null,
          externalReferenceCheckedAt: "2026-10-23T20:00:00Z",
        },
      ]}
    />,
  );
  expect(html).toContain("Última actualización");
  expect(html).toContain("22/10/2026");
  expect(html).toContain("17:00");
  expect(html).not.toContain("Invalid Date");
  expect(html).toContain("no implica que todos");
  expect(html).toContain("2 productos vinculados");
  expect(html).toContain("Actualizar precios de referencia");
  expect(html).not.toContain(">Actualizar</span>");
});

it("does not invent a review date for an empty catalog", () => {
  const html = renderToStaticMarkup(
    <CatalogReferenceRefresh
      compact
      token="test"
      organizationId="org"
      done={() => undefined}
      error={() => undefined}
      products={[]}
    />,
  );
  expect(html).toContain("Sin revisión registrada");
});

it("keeps the reference control compact without starting an update on render", () => {
  const done = vi.fn();
  const error = vi.fn();
  const html = renderToStaticMarkup(
    <CatalogReferenceRefresh
      token="test"
      organizationId="org"
      products={[]}
      done={done}
      error={error}
    />,
  );
  expect(html).toContain("Precios de referencia");
  expect(html).toContain("0 vinculados");
  expect(html).toContain("Actualizar");
  expect(html).toContain("h-11");
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(done).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it("keeps the refresh control in the global header and the branch selector in the account menu", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  const control = source.indexOf("<CatalogReferenceRefresh");
  const branch = source.indexOf("branchSelector={branchSelector}");
  const products = source.indexOf("function Products(");
  expect(control).toBeGreaterThan(0);
  expect(branch).toBeGreaterThan(0);
  expect(control).toBeLessThan(source.indexOf("</header>"));
  expect(branch).toBeLessThan(products);
  expect(source.match(/<CatalogReferenceRefresh/g)).toHaveLength(1);
  expect(source.slice(products)).not.toContain("refreshPriceReferences");
});
