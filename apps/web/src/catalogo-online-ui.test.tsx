import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Interruptor } from "./catalogo-configuracion";
import {
  direccionDelCatalogo,
  pestanasVisibles,
  sitioDelCatalogo,
} from "./lib/catalogo-online";
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

  it("cada ambiente usa su sitio del catálogo (SISTEMA-120)", () => {
    // Test: la gestión de test apunta al catálogo de test.
    expect(
      sitioDelCatalogo(
        "preprod-sistema-de-gestion.netlify.app",
        false,
        undefined,
      ),
    ).toBe("https://preprod-catalogo-sistema-de-gestion.netlify.app");
    // Un ambiente sin sitio publicado no inventa un link a localhost.
    expect(
      sitioDelCatalogo("sistema-de-gestion22.netlify.app", false, undefined),
    ).toBeNull();
    // En la PC, el de desarrollo.
    expect(sitioDelCatalogo("localhost", false, undefined)).toBe(
      "http://localhost:5175",
    );
    // Compilado con la variable, manda la variable.
    expect(
      sitioDelCatalogo("cualquiera.app", false, "https://catalogo.ejemplo.com"),
    ).toBe("https://catalogo.ejemplo.com");
  });
});
