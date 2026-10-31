import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProductInternalBarcode } from "./product-internal-barcode";
it("bounds the dialog independently of workspace overflow styles", () => {
  const html = renderToStaticMarkup(
    <ProductInternalBarcode
      token="test"
      organizationId="org"
      productId="product"
      draftName="Producto"
      draftSaleUnit="UNIT"
      pending={false}
      onPendingChange={() => {}}
    />,
  );
  expect(html).toContain("width:min(560px, calc(100vw - 32px))");
  expect(html).not.toContain("max-w-3xl");
});
it("places the code action beside the product title, above the scrolling form", () => {
  const source = readFileSync(
    new URL("./workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  const title = source.indexOf(
    '{editingProduct ? "Editar producto" : "Nuevo producto"}',
  );
  const action = source.indexOf("<ProductInternalBarcode", title);
  const body = source.indexOf("data-product-editor-body", title);
  expect(action).toBeGreaterThan(title);
  expect(action).toBeLessThan(body);
});
