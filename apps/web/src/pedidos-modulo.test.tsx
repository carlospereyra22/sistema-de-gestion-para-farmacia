import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { pestanasDePedidos } from "./lib/pedidos";
import { PedidosModulo } from "./pedidos-modulo";

const todo = { verPedidos: true, verPreventa: true, configurarCatalogo: true };

describe("Pedidos con Preventa y Catálogo online adentro (SISTEMA-119)", () => {
  it("cada uno ve las pestañas de lo que puede abrir", () => {
    expect(pestanasDePedidos(todo)).toEqual([
      "pedidos",
      "preventa",
      "catalogo",
    ]);
    // Mostrador: sólo los pedidos.
    expect(
      pestanasDePedidos({
        verPedidos: true,
        verPreventa: false,
        configurarCatalogo: false,
      }),
    ).toEqual(["pedidos"]);
    // Preventista: pedidos y su preventa, sin configurar el catálogo.
    expect(
      pestanasDePedidos({
        verPedidos: true,
        verPreventa: true,
        configurarCatalogo: false,
      }),
    ).toEqual(["pedidos", "preventa"]);
  });

  it("muestra las pestañas con su ícono y marca la elegida", () => {
    const html = renderToStaticMarkup(
      <PedidosModulo
        token="t"
        organizationId="o"
        branches={[]}
        pestana="catalogo"
        onPestana={() => undefined}
        acceso={todo}
        canManageCatalog
        preventaParaEditar={null}
        onEditarPreventa={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Secciones de pedidos"');
    expect(html.match(/data-icono-imagen/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/aria-current="page"[^>]*>.*Catálogo online/);
  });

  it("con una sola pestaña no muestra la barra", () => {
    const html = renderToStaticMarkup(
      <PedidosModulo
        token="t"
        organizationId="o"
        branches={[]}
        pestana="pedidos"
        onPestana={() => undefined}
        acceso={{
          verPedidos: true,
          verPreventa: false,
          configurarCatalogo: false,
        }}
        canManageCatalog={false}
        preventaParaEditar={null}
        onEditarPreventa={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(html).not.toContain("Secciones de pedidos");
  });
});
