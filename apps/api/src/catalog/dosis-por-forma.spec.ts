import {
  categoriaDeForma,
  dosisParaForma,
  esCombinacionConGuiaSimple,
  viaParaForma,
} from "./dosis-por-forma";

describe("dosis según la forma de la presentación", () => {
  it("reconoce la forma por el padrón o por la presentación", () => {
    expect(
      categoriaDeForma("Jarabe/Suspensión oral/Polvo para uso oral", ""),
    ).toBe("liquido");
    expect(
      categoriaDeForma("Ampollas/Frascos-Ampolla/Liofilizados/Soluc.Parent"),
    ).toBe("inyectable");
    // "Softgels" no es un gel de la piel.
    expect(categoriaDeForma("Cápsulas/Softgels")).toBe("solido");
    expect(categoriaDeForma("Cremas/Geles/Pomadas/Ungüentos")).toBe("topico");
    // La presentación aclara lo que la forma agrupa.
    expect(
      categoriaDeForma("Cremas/Geles/Pomadas/Ungüentos", "crema vag.x 20 g"),
    ).toBe("vaginal");
    expect(
      categoriaDeForma(
        "Sprays/Aerosoles/Soluciones para nebulizar",
        "spray nasal x 18 g",
      ),
    ).toBe("nasal");
    expect(categoriaDeForma("", "jbe.x 100 ml")).toBe("liquido");
    expect(categoriaDeForma("", "a.x 5 x 2 ml")).toBe("inyectable");
    expect(categoriaDeForma("Kit", "")).toBeNull();
  });

  const dipirona =
    "500 mg-1 g cada 6-8 h (máx. 4 g/día). Inyectable: 1 g IM o IV muy lenta cada 6-8 h (máx. 4 por día); la aplica un profesional.";

  it("toma la parte de la forma y deja la general para las orales", () => {
    expect(dosisParaForma(dipirona, "oral", "solido")).toEqual({
      dosis: "500 mg-1 g cada 6-8 h (máx. 4 g/día).",
      otraForma: false,
    });
    expect(dosisParaForma(dipirona, "oral", "liquido").dosis).toBe(
      "500 mg-1 g cada 6-8 h (máx. 4 g/día).",
    );
    expect(dosisParaForma(dipirona, "oral", "inyectable").dosis).toBe(
      "Inyectable: 1 g IM o IV muy lenta cada 6-8 h (máx. 4 por día); la aplica un profesional.",
    );
  });

  it("no muestra la dosis de los comprimidos para otra forma", () => {
    // Ibuprofeno en gel con la dosis oral: se remite al prospecto.
    expect(
      dosisParaForma("400 mg cada 6-8 h con comida.", "oral", "topico"),
    ).toEqual({ dosis: "", otraForma: true });
    expect(
      dosisParaForma("500 mg cada 8-12 h, 7 días.", "oral", "inyectable"),
    ).toEqual({ dosis: "", otraForma: true });
    // Un jarabe no se toma "1 comprimido"; sí si también dice los ml.
    expect(
      dosisParaForma("1 comprimido cada 12-24 h.", "oral", "liquido").otraForma,
    ).toBe(true);
    expect(
      dosisParaForma(
        "10-20 ml o 1-2 comprimidos cada 6-8 h.",
        "oral",
        "liquido",
      ).otraForma,
    ).toBe(false);
  });

  it("las indicaciones no son formas", () => {
    // "Candidiasis vaginal:" del fluconazol oral no es un óvulo.
    const fluconazol =
      "Candidiasis vaginal: 150 mg dosis única. Otras: 50-400 mg cada 24 h según indicación.";
    expect(dosisParaForma(fluconazol, "oral", "solido").dosis).toBe(fluconazol);
  });

  it("gotas de uso externo valen para ojo, oído o nariz", () => {
    expect(
      dosisParaForma("1-2 gotas cada 4-6 h.", "uso externo", "oftalmico")
        .otraForma,
    ).toBe(false);
    expect(
      dosisParaForma("Aplicar cada 12 h.", "uso externo", "oftalmico")
        .otraForma,
    ).toBe(true);
  });

  it("los textos que remiten al envase valen para cualquier forma", () => {
    expect(
      dosisParaForma(
        "Uso cada 8-12 h o cuando haga falta, según el producto.",
        "uso externo",
        "solido",
      ).otraForma,
    ).toBe(false);
  });

  it("muestra la vía de la forma cuando la del padrón no corresponde", () => {
    expect(viaParaForma("oral", "inyectable")).toBe("inyectable");
    expect(viaParaForma("oral", "liquido")).toBe("oral");
    expect(viaParaForma("vaginal", "topico")).toBe("vaginal");
  });

  it("una combinación no toma la dosis de una sola de sus drogas", () => {
    expect(
      esCombinacionConGuiaSimple("BUSCAPINA COMPOSITUM", {
        activeIngredient: "dipirona",
      }),
    ).toBe(true);
    expect(
      esCombinacionConGuiaSimple("BUSCAPINA COMPOSITUM N", {
        activeIngredient: "hioscina,n-butilbr.+paracetamol",
      }),
    ).toBe(false);
    expect(
      esCombinacionConGuiaSimple("NOVALGINA", { activeIngredient: "dipirona" }),
    ).toBe(false);
  });

  it("en comprimidos suma la dosis general y la de liberación prolongada", () => {
    expect(
      dosisParaForma(
        "50-100 mg cada 6 h (máx. 400 mg/día). Liberación prolongada: cada 12 h. Inyectable: 50-100 mg IM cada 4-6 h.",
        "oral",
        "solido",
      ).dosis,
    ).toBe(
      "50-100 mg cada 6 h (máx. 400 mg/día). Liberación prolongada: cada 12 h.",
    );
  });

  it("los sobres para tomar no son de uso rectal", () => {
    expect(
      categoriaDeForma("Enemas/Polvos para uso rectal", "sobres x 30"),
    ).toBe("solido");
  });
});
