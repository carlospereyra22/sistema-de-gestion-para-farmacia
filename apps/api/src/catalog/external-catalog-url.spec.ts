import { externalCatalogUrl } from "./external-catalog-url";

describe("external catalogue local connection", () => {
  it("derives only the independent local database without changing the commercial URL", () => {
    const commercial =
      "postgresql://user:password@localhost:5432/gestion_dev?schema=public";
    const result = new URL(externalCatalogUrl(undefined, commercial));
    expect(result.pathname).toBe("/catalogo_juncos_external");
    expect(result.search).toBe("");
    expect(new URL(commercial).pathname).toBe("/gestion_dev");
  });
  it.each([
    "postgresql://localhost/other",
    "postgresql://remote/gestion_dev",
    "https://localhost/gestion_dev",
  ])("rejects unsafe fallback %s", (url) => {
    expect(() => externalCatalogUrl(undefined, url)).toThrow();
  });
  it("does not fall back when an explicit connection is invalid", () => {
    expect(() =>
      externalCatalogUrl(
        "postgresql://remote/catalogo_juncos_external",
        "postgresql://localhost/gestion_dev",
      ),
    ).toThrow();
  });
});
