import {
  dosisDeComposicion,
  dosisParaPresentacion,
  leerFichaAlfaBeta,
  mismoNombre,
  slugAlfaBeta,
} from "./dosis-marcas";

describe("dosis de marcas desde la composición publicada", () => {
  it("arma la dirección de la ficha", () => {
    expect(slugAlfaBeta("IBU EVANOL RAPIDA ACCION")).toBe(
      "ibu-evanol-rapida-accion",
    );
    expect(slugAlfaBeta("ACTRON  400 RAPIDA ACCION NF")).toBe(
      "actron-400-rapida-accion-nf",
    );
  });

  it("lee el nombre y la composición de la ficha", () => {
    const html = `<title>ACTRON 600 RAPIDA ACCION</title>
      <p><span class="textonota"><b>COMPOSICION: </b>Cada cápsula blanda de gelatina contiene: Ibuprofeno 600 mg.</span></p>`;
    expect(leerFichaAlfaBeta(html)).toEqual({
      titulo: "ACTRON 600 RAPIDA ACCION",
      composicion:
        "Cada cápsula blanda de gelatina contiene: Ibuprofeno 600 mg.",
    });
  });

  it("solo acepta la ficha si el nombre es exactamente el de la marca", () => {
    // actron.vademecum es en realidad ACTRON 600: no se le asigna a ACTRON.
    expect(mismoNombre("ACTRON 600 RAPIDA ACCION", "ACTRON")).toBe(false);
    expect(mismoNombre("Actron  Rápida Acción", "ACTRON RAPIDA ACCION")).toBe(
      true,
    );
  });

  it("toma la dosis solo cuando no hay ambigüedad", () => {
    expect(
      dosisDeComposicion(
        "Cada cápsula blanda de gelatina contiene: Ibuprofeno 400 mg.",
        1,
      ),
    ).toBe("400 mg");
    expect(
      dosisDeComposicion(
        "Cada comprimido recubierto contiene: N-Butilbromuro de Hioscina 10 mg; Paracetamol 500 mg. Excipiente c.s.",
        2,
      ),
    ).toBe("10/500 mg");
    // Los excipientes con cantidades no cuentan.
    expect(
      dosisDeComposicion(
        "Cada comprimido contiene: Dipirona 500 mg. Excipientes: lactosa 20 mg.",
        1,
      ),
    ).toBe("500 mg");
    // Varias formas en la misma ficha, unidades mezcladas o cantidad distinta
    // de componentes: no se elige.
    expect(
      dosisDeComposicion(
        "Cada comprimido contiene: Dipirona 500 mg. Cada 5 ml de jarabe contiene: Dipirona 250 mg.",
        1,
      ),
    ).toBeNull();
    expect(
      dosisDeComposicion("Cada sobre contiene: Vitamina C 1 g; Zinc 10 mg.", 2),
    ).toBeNull();
    expect(
      dosisDeComposicion("Cada comprimido contiene: Ibuprofeno 400 mg.", 2),
    ).toBeNull();
  });

  it("asigna la dosis solo a la presentación de la misma forma", () => {
    const gotas = "Cada 100 ml contiene: Propinox 1 g.";
    expect(dosisParaPresentacion(gotas, 1, "comp.rec.x 10")).toBeNull();
    // Una sola forma líquida: la concentración por ml.
    expect(dosisParaPresentacion(gotas, 1, "gts.x 20 ml")).toBe("10 mg/ml");
    const ampolla = "Cada ampolla contiene: N-butilbromuro de hioscina 20 mg.";
    expect(dosisParaPresentacion(ampolla, 1, "a.x 3")).toBe("20 mg");
    expect(dosisParaPresentacion(ampolla, 1, "grag.x 20")).toBeNull();
    const capsula =
      "Cada cápsula blanda de gelatina contiene: Ibuprofeno 400 mg.";
    expect(dosisParaPresentacion(capsula, 1, "cáps.gelat.blanda x 10")).toBe(
      "400 mg",
    );
    expect(dosisParaPresentacion(capsula, 1, "comp.x 10")).toBeNull();
  });

  it("parte las fichas con varias formas y toma la de la presentación", () => {
    const novalgina =
      "Comprimidos: Cada comprimido contiene: 500 mg de Dipirona. Excipientes: Almidón de Maíz; Lactosa; c.s. Solución oral (gotas): Cada 100 ml contiene: 50 g de Dipirona. Excipientes: Agua Purificada c.s. Solución inyectable: Cada ml contiene: 500 mg de Dipirona. Excipientes: Agua para Inyectables, c.s.";
    expect(dosisParaPresentacion(novalgina, 1, "comp.x 10")).toBe("500 mg");
    expect(dosisParaPresentacion(novalgina, 1, "gts.x 20 ml")).toBe(
      "500 mg/ml",
    );
    expect(dosisParaPresentacion(novalgina, 1, "a.x 5 x 2 ml")).toBe(
      "500 mg/ml",
    );
    // La ficha no describe el jarabe: no se adivina con la de las gotas.
    expect(dosisParaPresentacion(novalgina, 1, "jbe.x 100 ml")).toBeNull();
  });

  it("lee el punto de miles de la ficha", () => {
    // SUPRITEM: "5.000 mg" son cinco mil, no cinco.
    expect(
      dosisParaPresentacion(
        "Cada 100 ml contiene: Dipirona Sódica 5.000 mg. Excipientes c.s.",
        1,
        "jbe. x 100 ml",
      ),
    ).toBe("50 mg/ml");
    expect(
      dosisDeComposicion("Cada comprimido contiene: Paracetamol 1.000 mg.", 1),
    ).toBe("1000 mg");
    expect(
      dosisDeComposicion("Cada comprimido contiene: Vitamina D3 0,25 mg.", 1),
    ).toBe("0.25 mg");
  });
});
