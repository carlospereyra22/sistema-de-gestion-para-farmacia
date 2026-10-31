import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ExternalProductLookup } from "./external-product-lookup";

it("keeps a single compact barcode field with no second search panel", () => {
  const html = renderToStaticMarkup(
    <ExternalProductLookup
      token="test"
      organizationId="org"
      code=""
      onCode={() => undefined}
      onApply={() => undefined}
      onMedication={() => undefined}
      allowAutomatic
      disabled={false}
    />,
  );
  expect(html.match(/<input/g)).toHaveLength(1);
  expect(html).toContain("Código de barras");
  expect(html).not.toContain("Completar desde un código");
  expect(html).not.toContain("<section");
});
