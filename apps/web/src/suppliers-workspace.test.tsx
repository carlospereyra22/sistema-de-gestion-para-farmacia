import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SuppliersWorkspace } from "./suppliers-workspace";

it("offers a supplier directory with search, account filters, creation and bottom pagination", () => {
  const html = renderToStaticMarkup(
    <SuppliersWorkspace token="test" organizationId="org" />,
  );
  expect(html).not.toContain("<h1");
  expect(html).not.toContain("Contactos y condiciones de compra");
  for (const label of [
    "Buscar proveedor",
    "Con cuenta corriente",
    "Sin cuenta corriente",
    "Nuevo proveedor",
    "Contacto",
    "Plazo habitual",
    "Observaciones",
    "Páginas de proveedores",
  ])
    expect(html).toContain(label);
  expect(html.indexOf("Páginas de proveedores")).toBeGreaterThan(
    html.indexOf("</table>"),
  );
  expect(html.indexOf("> Eliminados")).toBeGreaterThan(
    html.indexOf("Nuevo proveedor"),
  );
  expect(html).toMatch(/<th[^>]*text-center[^>]*>Acciones/);
  expect(html).not.toContain("Cargando proveedores…");
});

it("renders nothing while another section is active", () => {
  expect(
    renderToStaticMarkup(
      <SuppliersWorkspace token="test" organizationId="org" visible={false} />,
    ),
  ).toBe("");
});
