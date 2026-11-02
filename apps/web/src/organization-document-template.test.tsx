import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationDocumentTemplate } from "./organization-document-template";

it("renders the A4 section while the template loads", () => {
  const html = renderToStaticMarkup(
    <OrganizationDocumentTemplate token="t" organizationId="o" />,
  );
  expect(html).toContain("Comprobante A4");
  expect(html).toContain("el ticket térmico no cambia");
  expect(html).toContain("Cargando plantilla…");
});
