import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfertasWorkspace } from "./ofertas-workspace";
import { TOKEN_SIN_CONEXION } from "./lib/cache-local";

const props = {
  organizationId: "org",
  branches: [],
  products: [],
  stock: [],
  canManage: true,
  canSeeCosts: false,
  onError: () => {},
};

describe("apartado Ofertas sin conexión", () => {
  it("avisa y no ofrece crear ofertas", () => {
    const html = renderToStaticMarkup(
      <OfertasWorkspace {...props} token={TOKEN_SIN_CONEXION} />,
    );
    expect(html).toContain("Sin conexión.");
    expect(html).toContain("Ventas las sigue aplicando");
    expect(html).not.toContain("Nueva oferta");
  });

  it("con conexión no muestra el aviso", () => {
    const html = renderToStaticMarkup(
      <OfertasWorkspace {...props} token="token" />,
    );
    expect(html).not.toContain("Sin conexión.");
    expect(html).toContain("Nueva oferta");
  });
});
