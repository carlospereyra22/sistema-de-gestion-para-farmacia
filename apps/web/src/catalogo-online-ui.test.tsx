import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Interruptor } from "./catalogo-configuracion";
import { direccionDelCatalogo, pestanasVisibles } from "./lib/catalogo-online";
import { EstadoPedidoEtiqueta } from "./catalogo-pedidos";

describe("catálogo online: pantallas", () => {
  it("la etiqueta dice el estado según quién mira", () => {
    expect(
      renderToStaticMarkup(
        <EstadoPedidoEtiqueta estado="RECEIVED" para="farmacia" />,
      ),
    ).toContain("Por confirmar");
    expect(
      renderToStaticMarkup(
        <EstadoPedidoEtiqueta estado="RECEIVED" para="cliente" />,
      ),
    ).toContain("Recibido");
  });

  it("el interruptor es un switch accesible con su estado", () => {
    const html = renderToStaticMarkup(
      <Interruptor
        label="Mostrar productos sin stock"
        hint="Ayuda"
        checked
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Mostrar productos sin stock");
  });

  it("muestra sólo las pestañas que el usuario puede usar", () => {
    expect(pestanasVisibles(true, false).map(({ id }) => id)).toEqual([
      "pedidos",
    ]);
    expect(pestanasVisibles(false, true).map(({ id }) => id)).toEqual([
      "usuarios",
      "configuracion",
    ]);
  });

  it("el link del cliente es del sitio del catálogo, no de la gestión", () => {
    expect(
      direccionDelCatalogo("https://catalogo.ejemplo.com/", "farmacia-perez"),
    ).toBe("https://catalogo.ejemplo.com/farmacia-perez");
  });
});
