import { origenesPermitidos } from "./cors";

describe("CORS por ruta", () => {
  const origenes = {
    gestion: "https://gestion.ejemplo.com",
    catalogo: "https://catalogo.ejemplo.com",
  };

  it("el sitio del catálogo sólo llega a las rutas públicas del catálogo", () => {
    expect(
      origenesPermitidos("/api/v1/catalogo/farmacia/productos?q=a", origenes),
    ).toContain(origenes.catalogo);
    for (const ruta of [
      "/api/v1/auth/login",
      "/api/v1/organizations/x/catalogo-online/pedidos",
      "/api/v1/catalogos",
      "/api/v1/health?/api/v1/catalogo/",
    ])
      expect(origenesPermitidos(ruta, origenes)).toEqual([origenes.gestion]);
  });
});
