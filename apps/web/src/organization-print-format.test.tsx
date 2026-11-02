import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationPrintFormat } from "./organization-print-format";

it("offers ticket or A4 as the organization's default print format", () => {
  const html = renderToStaticMarkup(
    <OrganizationPrintFormat token="t" organizationId="o" />,
  );
  expect(html).toContain("Formato de impresión predeterminado");
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain("Ticket térmico");
  expect(html).toContain("Hoja A4");
  // Mientras carga la preferencia no se puede elegir.
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
