import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { canOpenView } from "./lib/workspace-permissions";
import { readWorkspaceLocation } from "./lib/workspace-location";
import { OrganizacionVistaPedidos } from "./organizacion-vista-pedidos";

const props = {
  token: "t",
  organizationId: "o",
  onCambio: () => undefined,
};

describe("ver los pedidos juntos (SISTEMA-119)", () => {
  it("muestra el switch con su estado", () => {
    const apagado = renderToStaticMarkup(
      <OrganizacionVistaPedidos {...props} unificados={false} puedeCambiar />,
    );
    expect(apagado).toContain('role="switch"');
    expect(apagado).toContain('aria-checked="false"');
    expect(apagado).toContain('aria-label="Ver los pedidos juntos"');
    expect(apagado).toContain("cada módulo muestra sus pedidos");

    const prendido = renderToStaticMarkup(
      <OrganizacionVistaPedidos {...props} unificados puedeCambiar />,
    );
    expect(prendido).toContain('aria-checked="true"');
    expect(prendido).toContain("la versión celular de preventa no cambia");
  });

  it("sin permiso para administrar no se puede cambiar", () => {
    const html = renderToStaticMarkup(
      <OrganizacionVistaPedidos
        {...props}
        unificados={false}
        puedeCambiar={false}
      />,
    );
    expect(html).toMatch(/role="switch"[^>]*disabled=""/);
    expect(html).toContain("Lo cambia quien administra la farmacia.");
  });

  it("la pantalla Pedidos tiene dirección y la abre quien ve algún origen", () => {
    expect(
      readWorkspaceLocation(new URLSearchParams("pagina=pedidos")).view,
    ).toBe("Pedidos");
    expect(canOpenView("Pedidos", ["SALE_READ"])).toBe(true);
    expect(canOpenView("Pedidos", ["PREVENTA_SELL"])).toBe(true);
    expect(canOpenView("Pedidos", ["CATALOG_READ"])).toBe(false);
  });
});
