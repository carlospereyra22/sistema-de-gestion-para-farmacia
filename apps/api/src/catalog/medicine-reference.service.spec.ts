import {
  buildMedicineSearchQueries,
  concentrationFromText,
  parsePriceMinor,
  parsePriceRemedies,
} from "./medicine-reference.service";

describe("medicine reference parsing", () => {
  it("converts Argentine price strings to minor units", () => {
    expect(parsePriceMinor("$ 37.451,50")).toBe(3745150);
    expect(parsePriceMinor("ARS 8.100")).toBe(810000);
    expect(parsePriceMinor("invalid")).toBeNull();
  });

  it("broadens package queries while preserving the original query", () => {
    expect(buildMedicineSearchQueries("actron 600 x20")).toEqual([
      "actron 600 x20",
      "actron 600",
      "actron",
    ]);
  });

  it("toma la dosis escrita en la presentación o el nombre del padrón", () => {
    expect(concentrationFromText("500 mg comp.x 20", "MIGRAL")).toBe("500 mg");
    expect(concentrationFromText("400 mg cáps.x 10 promo", "ACTRON")).toBe(
      "400 mg",
    );
    expect(
      concentrationFromText("susp.oral x 100 ml", "ACTRON PEDIATRICO 4%"),
    ).toBe("4%");
    expect(concentrationFromText("100 mg/5 ml susp.oral x 100 ml")).toBe(
      "100 mg/5 ml",
    );
  });

  it("no toma tamaños de envase ni números sueltos como dosis", () => {
    expect(concentrationFromText("comp.x 20", "MIGRAL COMPOSITUM")).toBe("");
    expect(concentrationFromText("crema x 30 g", "ACTRON 600")).toBe("");
    expect(concentrationFromText("gts.x 20 ml", "SERTAL")).toBe("");
  });

  it("extracts and ranks Precios de Remedios candidates", () => {
    const html = `
      <tr data-price="37.451">
        <td class="product-text"><span>ACTRON 600</span><span>comp. x 10</span></td>
        <td class="laboratorio-text">Bayer</td>
      </tr>
      <tr data-price="12.000">
        <td class="product-text"><span>OTRO PRODUCTO</span></td>
        <td class="laboratorio-text">Laboratorio</td>
      </tr>
    `;

    expect(parsePriceRemedies(html, "Actron 600 x10")).toEqual([
      expect.objectContaining({
        source: "preciosderemedios",
        name: "ACTRON 600",
        presentation: "comp. x 10",
        laboratory: "Bayer",
        priceMinor: 3745100,
      }),
    ]);
  });
});
