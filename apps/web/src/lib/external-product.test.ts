import { describe, expect, it } from "vitest";
import {
  distinctExternalProducts,
  externalSuggestionGroups,
  externalSaleUnit,
  externalGtin,
  externalProductFields,
  type ExternalProductCandidate,
} from "./external-product";

describe("external product suggestions", () => {
  it("shows one whole ficha for equivalent Excel and SEPA descriptions", () => {
    const excel: ExternalProductCandidate = {
      code: "7791274196447",
      gtin14: "07791274196447",
      name: "Gel Capilar Brillo y Control 150 g",
      brand: "Algabo",
      presentation: "150 g",
      scope_group: "Cabello",
      source: "excel270",
      fingerprint: "excel",
      license: "user",
    };
    const sepa = {
      ...excel,
      name: "GEL FIJADOR BRILLO+CONTROL ALGABO X 150 GRS",
      brand: "ALGABO",
      presentation: "1 UNI",
      source: "sepa",
      fingerprint: "sepa",
    };
    expect(distinctExternalProducts([sepa, excel, sepa])).toEqual([excel]);
    expect(
      distinctExternalProducts([excel, { ...sepa, name: "Gel 200 g" }]),
    ).toHaveLength(2);
    expect(
      distinctExternalProducts([
        excel,
        { ...sepa, review_reason: "marcas_contradictorias" },
      ]),
    ).toHaveLength(2);
    expect(
      distinctExternalProducts([excel, { ...sepa, brand: "Otra marca" }]),
    ).toHaveLength(2);
    expect(
      distinctExternalProducts([
        excel,
        { ...excel, source: "openbeauty", license: "ODbL-1.0" },
      ]),
    ).toHaveLength(2);
    const beauty = { ...excel, source: "openbeauty", license: "ODbL-1.0" };
    expect(externalSuggestionGroups([excel], [beauty])[0]?.rows).toEqual([
      excel,
    ]);
    expect(externalSuggestionGroups([], [beauty])[0]?.rows).toEqual([beauty]);
    expect(externalSuggestionGroups([], [beauty])[0]?.title).toContain("ODbL");
  });
  it("validates exact GTINs without inventing or repairing codes", () => {
    expect(externalGtin("7791274197864")).toBe("07791274197864");
    for (const code of ["7791274197865", "abc", "00000000", "2000000000015"])
      expect(externalGtin(code)).toBeNull();
  });
  it("copies only descriptive fields and exact existing category matches", () => {
    const candidate: ExternalProductCandidate = {
      code: "7791274197864",
      gtin14: "07791274197864",
      name: "Barro vegetal Algabo",
      brand: "Algabo",
      presentation: "200 g",
      scope_group: "Dermocosmética",
      source: "sepa",
      fingerprint: "test",
      license: "CC-BY-4.0",
    };
    const fields = externalProductFields(candidate, [
      { id: "skin", name: "Dermocosmetica" },
    ]);
    expect(fields.categoryId).toBe("skin");
    expect(
      externalProductFields(
        {
          ...candidate,
          category_path: ["Cuidado personal", "Rostro", "Cremas"],
        },
        [
          {
            id: "face",
            name: "Cremas",
            path: "Cuidado personal › Rostro › Cremas",
          },
          {
            id: "body",
            name: "Cremas",
            path: "Cuidado personal › Cuerpo › Cremas",
          },
        ],
      ).categoryId,
    ).toBe("face");
    expect(
      externalProductFields(candidate, [
        { id: "one", name: "Dermocosmetica" },
        { id: "two", name: "Dermocosmetica" },
      ]).categoryId,
    ).toBe("");
    expect(Object.keys(fields).sort()).toEqual([
      "categoryId",
      "description",
      "name",
      "presentation",
    ]);
    expect(fields.description).toContain("Marca: Algabo");
    expect(externalSaleUnit({ ...candidate, unit: "EA", quantity: "1" })).toBe(
      "UNIT",
    );
    expect(
      externalSaleUnit({ ...candidate, unit: "uni.", quantity: "1" }),
    ).toBe("UNIT");
    expect(
      externalSaleUnit({ ...candidate, unit: "ml", quantity: "250" }),
    ).toBeUndefined();
    expect(externalSaleUnit(candidate)).toBeUndefined();
    expect(
      externalProductFields(candidate, [{ id: "other", name: "Perfumería" }])
        .categoryId,
    ).toBe("");
    expect(
      externalProductFields({ ...candidate, source: "openbeauty" }, [])
        .description,
    ).toContain("ODbL-1.0");
    const withImage = {
      ...candidate,
      image: {
        data_url: "data:image/jpeg;base64,test",
        url: "https://farmarstorage.blob.core.windows.net/products/photo.webp",
        source: "public_farmar",
        source_ref: "https://www.farmar.com.ar/producto/test",
        license: "SOURCE_IMAGE_NO_OPEN_LICENSE_GRANTED",
        sha256: "test",
      },
    };
    expect(externalProductFields(withImage, []).description).not.toContain(
      "Foto de referencia:",
    );
    expect(
      externalProductFields(withImage, [], { includeImage: true }).description,
    ).toContain("Foto de referencia: https://www.farmar.com.ar/producto/test");
  });
});
