import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrganizationWorkspace } from "./organization-workspace";
import type { OrganizationTab } from "./lib/workspace-location";

function render(tab: OrganizationTab) {
  return renderToStaticMarkup(
    <OrganizationWorkspace
      token="test"
      organizationId="org"
      tab={tab}
      onTabChange={vi.fn()}
      onBranchesChange={vi.fn()}
      onNameChange={vi.fn()}
      onUsers={vi.fn()}
    />,
  );
}
describe("organization workspace", () => {
  it.each(["general", "fiscal", "branches", "tickets"] as const)(
    "has the four organization sections on %s",
    (tab) => {
      const html = render(tab);
      const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
      expect(nav.match(/<button/g)).toHaveLength(4);
      expect(nav).toContain("Facturación");
      expect(nav).toContain("Datos generales");
      expect(nav).toContain("Sucursales");
      expect(nav).toContain("Tickets y comprobantes");
      expect(nav).not.toContain("Usuarios");
      expect(nav).not.toContain("Roles");
      expect(html).not.toContain("Configuración general");
      expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    },
  );
  it("provides shortcuts from the summary without an active-branch KPI", () => {
    const html = render("general");
    expect(html).toContain("Datos de la organización");
    expect(html).toContain("Ir a sucursales");
    expect(html).toContain("Configurar tickets");
    expect(html).not.toContain("sucursales activas");
  });
  it("keeps ticket configuration limited to existing identity and attendant data", () => {
    const html = render("tickets");
    expect(html).toContain("Encabezado de los tickets");
    expect(html).toContain("Nombre de quien atiende");
    expect(html).not.toContain("58 mm");
    expect(html).not.toContain("Alineación");
    expect(html).not.toContain("Negrita");
    expect(html).not.toContain("Centenario");
  });
});
