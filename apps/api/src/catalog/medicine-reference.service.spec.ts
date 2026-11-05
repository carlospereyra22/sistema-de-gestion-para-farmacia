import {
  buildMedicineSearchQueries,
  concentrationFromText,
  parsePriceMinor,
  parsePriceRemedies,
  parsePriceRemediesCombos,
  MedicineReferenceService,
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
  it("busca las presentaciones dentro de la combinación de Precios de Remedios", async () => {
    const groups = `
      <a href="?busqueda=buscapina+duo&amp;combo=Hioscina+butilbromuro+%2B+Paracetamol">Ver productos</a>
      <a href="https://ejemplo.com/?busqueda=buscapina+duo&amp;combo=Otro">Ajeno</a>
    `;
    expect(parsePriceRemediesCombos(groups, "buscapina duo")).toEqual([
      "Hioscina butilbromuro + Paracetamol",
    ]);
    const products = `
      <tr class="border-b" data-price="11278">
        <td class="product-column"><div class="product-text responsive-text"><span class="font-bold">BUSCAPINA DUO</span><span class="font-normal">Bls. Comp. Rec. x 10</span></div></td>
        <td class="laboratorio-column"><div class="laboratorio-text responsive-text">OPELLA</div></td>
      </tr>
    `;
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(groups))
      .mockResolvedValueOnce(new Response(products));
    try {
      const service = new MedicineReferenceService();
      const result = await service.search("buscapina duo", "preciosderemedios");
      expect(result).toEqual([
        expect.objectContaining({
          name: "BUSCAPINA DUO",
          presentation: "Bls. Comp. Rec. x 10",
          laboratory: "OPELLA",
          priceMinor: 1127800,
        }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[0]).toContain(
        "combo=Hioscina+butilbromuro+%2B+Paracetamol",
      );
      expect(
        await service.search("BUSCAPINA DUO", "preciosderemedios"),
      ).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
