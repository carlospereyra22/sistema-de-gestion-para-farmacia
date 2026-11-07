import { canonicalGtin } from "./external-gtin";
import {
  catalogAuthorized,
  ExternalCatalogService,
} from "./external-catalog.service";

describe("farmacias autorizadas al catálogo externo", () => {
  it("sigue aceptando una sola farmacia, como en producción", () => {
    expect(catalogAuthorized("uno", "uno")).toBe(true);
    expect(catalogAuthorized("dos", "uno")).toBe(false);
  });

  it("acepta varias, con o sin espacios", () => {
    expect(catalogAuthorized("uno", "uno, dos")).toBe(true);
    expect(catalogAuthorized("dos", "uno, dos")).toBe(true);
    expect(catalogAuthorized("tres", "uno, dos")).toBe(false);
  });

  it("no acepta parte de un identificador", () => {
    expect(catalogAuthorized("un", "uno,dos")).toBe(false);
  });

  it("sin configuración, o sin farmacia, no autoriza a nadie", () => {
    expect(catalogAuthorized("uno")).toBe(false);
    expect(catalogAuthorized("", "")).toBe(false);
    expect(catalogAuthorized("", "uno,,dos")).toBe(false);
  });
});

describe("external catalogue safety", () => {
  it("does not expose private catalogue inputs to another organization", async () => {
    const preview = process.env.EXTERNAL_CATALOG_PREVIEW;
    const org = process.env.EXTERNAL_CATALOG_ORGANIZATION_ID;
    try {
      process.env.EXTERNAL_CATALOG_PREVIEW = "true";
      process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = "owner";
      await expect(
        new ExternalCatalogService().lookup("7500435211895", "other"),
      ).rejects.toThrow("desactivado");
    } finally {
      if (preview === undefined) delete process.env.EXTERNAL_CATALOG_PREVIEW;
      else process.env.EXTERNAL_CATALOG_PREVIEW = preview;
      if (org === undefined)
        delete process.env.EXTERNAL_CATALOG_ORGANIZATION_ID;
      else process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = org;
    }
  });
  it("validates the actual attached Pantene code and canonicalizes equivalent padding", () => {
    expect(canonicalGtin("7500435211895")).toBe("07500435211895");
    expect(canonicalGtin("07500435211895")).toBe("07500435211895");
  });
  it.each([
    "",
    "7500435211894",
    "0000000000000",
    "7.500435211895e12",
    "7500435211895'",
    "７５００４３５２１１８９５",
    "2000000000008",
  ])("rejects %s", (code) => {
    expect(() => canonicalGtin(code)).toThrow();
  });
  it("stays disabled by default and requires an explicit production flag", async () => {
    const previous = process.env.EXTERNAL_CATALOG_PREVIEW;
    const enabled = process.env.EXTERNAL_CATALOG_ENABLED;
    const node = process.env.NODE_ENV;
    const organization = process.env.EXTERNAL_CATALOG_ORGANIZATION_ID;
    try {
      delete process.env.EXTERNAL_CATALOG_PREVIEW;
      delete process.env.EXTERNAL_CATALOG_ENABLED;
      const service = new ExternalCatalogService();
      await expect(service.lookup("7500435211895")).rejects.toThrow(
        "desactivado",
      );
      process.env.NODE_ENV = "production";
      await expect(service.lookup("7500435211895")).rejects.toThrow(
        "desactivado",
      );
      process.env.EXTERNAL_CATALOG_ENABLED = "true";
      process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = "other";
      await expect(service.lookup("7500435211895", "owner")).rejects.toThrow(
        "desactivado",
      );
    } finally {
      if (previous === undefined) delete process.env.EXTERNAL_CATALOG_PREVIEW;
      else process.env.EXTERNAL_CATALOG_PREVIEW = previous;
      if (enabled === undefined) delete process.env.EXTERNAL_CATALOG_ENABLED;
      else process.env.EXTERNAL_CATALOG_ENABLED = enabled;
      if (node === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = node;
      if (organization === undefined)
        delete process.env.EXTERNAL_CATALOG_ORGANIZATION_ID;
      else process.env.EXTERNAL_CATALOG_ORGANIZATION_ID = organization;
    }
  });
});
