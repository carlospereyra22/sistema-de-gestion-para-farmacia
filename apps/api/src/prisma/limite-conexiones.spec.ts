import { urlConLimiteDeConexiones } from "./limite-conexiones";

const URL_BASE = "postgresql://u:p@127.0.0.1:5432/gestion_dev?schema=public";

describe("urlConLimiteDeConexiones", () => {
  it("deja la URL igual si no se configura nada", () => {
    expect(urlConLimiteDeConexiones(URL_BASE, undefined, undefined)).toBe(
      URL_BASE,
    );
    expect(urlConLimiteDeConexiones(undefined, "10", undefined)).toBe(
      undefined,
    );
  });

  it("agrega el tope y la espera conservando el resto", () => {
    const url = new URL(urlConLimiteDeConexiones(URL_BASE, "10", "20")!);
    expect(url.searchParams.get("schema")).toBe("public");
    expect(url.searchParams.get("connection_limit")).toBe("10");
    expect(url.searchParams.get("pool_timeout")).toBe("20");
  });

  it("respeta un tope ya escrito en la URL", () => {
    const url = new URL(
      urlConLimiteDeConexiones(`${URL_BASE}&connection_limit=3`, "10", "")!,
    );
    expect(url.searchParams.get("connection_limit")).toBe("3");
  });

  it("rechaza valores que no son enteros válidos", () => {
    expect(() => urlConLimiteDeConexiones(URL_BASE, "muchas", "")).toThrow(
      "connection_limit",
    );
    expect(() => urlConLimiteDeConexiones(URL_BASE, "0", "")).toThrow();
  });
});
