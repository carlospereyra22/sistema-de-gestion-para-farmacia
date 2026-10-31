import { canonicalGtin } from "./external-gtin";
import { ExternalCatalogService } from "./external-catalog.service";

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
  it("stays disabled by default and refuses production even with the preview flag", async () => {
    const previous = process.env.EXTERNAL_CATALOG_PREVIEW;
    const node = process.env.NODE_ENV;
    try {
      delete process.env.EXTERNAL_CATALOG_PREVIEW;
      const service = new ExternalCatalogService();
      await expect(service.lookup("7500435211895")).rejects.toThrow(
        "desactivado",
      );
      process.env.EXTERNAL_CATALOG_PREVIEW = "true";
      process.env.NODE_ENV = "production";
      await expect(service.lookup("7500435211895")).rejects.toThrow(
        "desactivado",
      );
    } finally {
      if (previous === undefined) delete process.env.EXTERNAL_CATALOG_PREVIEW;
      else process.env.EXTERNAL_CATALOG_PREVIEW = previous;
      if (node === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = node;
    }
  });
});
