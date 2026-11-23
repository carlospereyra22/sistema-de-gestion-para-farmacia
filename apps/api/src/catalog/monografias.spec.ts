import {
  categoriaDeForma,
  dosisParaForma,
  usoParaForma,
  viaSinForma,
} from "./dosis-por-forma";
import { compararDosis, dosisDe } from "./equivalentes";
import {
  claveNombre,
  concentracionTopica,
  dosisDeFicha,
  elegirMonografia,
  mismoLaboratorio,
  viaDeFicha,
} from "./monografias";

const ficha = (name: string, laboratory: string) => ({ name, laboratory });
const indice = (...fichas: { name: string; laboratory: string }[]) => {
  const mapa = new Map<string, { name: string; laboratory: string }[]>();
  for (const f of fichas)
    mapa.set(claveNombre(f.name), [
      ...(mapa.get(claveNombre(f.name)) ?? []),
      f,
    ]);
  return mapa;
};

describe("fichas publicadas de cada marca (SISTEMA-123)", () => {
  it("vincula por nombre exacto y, con homónimos, por laboratorio", () => {
    const fichas = indice(
      ficha("VOLTAREN EMULGEL", "HALEON ARG"),
      ficha("SINDOL 400 V.L.", "MICROSULES"),
      ficha("ACTRON", "BAYER"),
      ficha("ACTRON", "OTRO LAB"),
    );
    expect(
      elegirMonografia(
        { name: "Voltaren  Emulgel", laboratory: "Haleon Argentina" },
        fichas,
      )?.laboratory,
    ).toBe("HALEON ARG");
    expect(
      elegirMonografia(
        { name: "SINDOL 400 VL", laboratory: "Microsules Arg." },
        fichas,
      ),
    ).not.toBeNull();
    expect(
      elegirMonografia({ name: "ACTRON", laboratory: "Bayer Consumer" }, fichas)
        ?.laboratory,
    ).toBe("BAYER");
    // Homónimos sin laboratorio que desempate: nada.
    expect(
      elegirMonografia({ name: "ACTRON", laboratory: "" }, fichas),
    ).toBeNull();
    // Otro laboratorio con el mismo nombre: no es la misma marca.
    expect(
      elegirMonografia(
        { name: "VOLTAREN EMULGEL", laboratory: "Novartis" },
        fichas,
      ),
    ).toBeNull();
    expect(
      elegirMonografia({ name: "OTRO", laboratory: "" }, fichas),
    ).toBeNull();
  });

  it("compara laboratorios sin palabras de razón social", () => {
    expect(mismoLaboratorio("Haleon Argentina", "HALEON ARG")).toBe(true);
    expect(mismoLaboratorio("Laboratorios Bagó S.A.", "BAGO")).toBe(true);
    expect(mismoLaboratorio("Bayer Consumer", "Savant Consumer")).toBe(false);
  });

  it("lee la concentración de cremas y geles por cada 100 g", () => {
    const voltaren =
      "Cada 100 g contiene: Diclofenaco Dietilamónico 1.16 g (1.16%) equivalente a 1.0 g de Diclofenaco Sódico. Excipientes: Carbómeros.";
    expect(concentracionTopica(voltaren, 1, "pomo x 30 g")).toBe(
      "1.16 g/100 g",
    );
    expect(
      compararDosis(dosisDe("X", "1.16 g/100 g"), dosisDe("Y", "1,16%")),
    ).toBe("igual");
    // Varias formas con "cada 100": no se elige.
    expect(
      concentracionTopica(
        "Solución tópica: Cada 100 ml contiene: Povidona-Iodo 10 g. Jabón líquido: Cada 100 ml contiene: Povidona-Iodo 5 g.",
        1,
        "sol.tópica x 60 ml",
      ),
    ).toBeNull();
    // Combinaciones y comprimidos no se leen como tópicos.
    expect(concentracionTopica(voltaren, 2, "gel x 30 g")).toBeNull();
    expect(concentracionTopica(voltaren, 1, "comp.x 10")).toBeNull();
  });

  it("toma la dosis por unidad de comprimidos y óvulos", () => {
    expect(
      dosisDeFicha("Cada óvulo contiene: 200 mg de Clotrimazol.", 1, "óv.x 3"),
    ).toBe("200 mg");
  });

  it("deduce la vía del modo de uso sólo cuando es clara", () => {
    expect(
      viaDeFicha("Tópica. Aplique una capa delgada 3 a 4 veces al día."),
    ).toBe("uso externo");
    expect(viaDeFicha("1 o 2 aplicaciones en cada fosa nasal por día.")).toBe(
      "nasal",
    );
    expect(
      viaDeFicha("Instilar 1 gota en el saco conjuntival cada 6 horas."),
    ).toBe("oftálmica");
    expect(viaDeFicha("Ingerir 1 comprimido cada 8 horas.")).toBe("oral");
    expect(viaDeFicha("Según indicación médica.")).toBeNull();
  });

  it("muestra el uso y la dosis de la forma del producto", () => {
    const uso =
      "Colirio: ojo seco (lágrimas artificiales). Crema o polvo: adhesivo para prótesis dentales.";
    const crema = categoriaDeForma(
      "Cremas/Geles/Pomadas/Ungüentos",
      "adh.ext.fuerte x 20 g",
    );
    expect(usoParaForma(uso, "uso externo", crema)).toBe(
      "Crema o polvo: adhesivo para prótesis dentales.",
    );
    expect(usoParaForma(uso, "uso externo", "oftalmico")).toBe(
      "Colirio: ojo seco (lágrimas artificiales).",
    );
    // Sin etiquetas de forma, el texto entero.
    expect(usoParaForma("Dolor y fiebre.", "oral", "solido")).toBe(
      "Dolor y fiebre.",
    );
    expect(
      dosisParaForma(
        "Nasal: 1-2 aplicaciones en cada fosa cada 12 h, no más de 3 días. Colirio: 1-2 gotas cada 6 h, no más de 3 días.",
        "nasal",
        categoriaDeForma(
          "Gotas oftálmicas/Colirios",
          "gts.oft.x 10 ml",
          "NEWCLAR",
        ),
      ).dosis,
    ).toBe("Colirio: 1-2 gotas cada 6 h, no más de 3 días.");
  });

  it("la forma se aclara con el nombre y los sprays no son siempre para inhalar", () => {
    expect(
      categoriaDeForma(
        "Cremas/Geles/Pomadas/Ungüentos",
        "crema x 35 g",
        "EVACARE CREMA VAGINAL",
      ),
    ).toBe("vaginal");
    expect(
      categoriaDeForma("Sprays/Aerosoles", "env.x 187 g", "ALGISPRAY"),
    ).toBeNull();
    // Sin forma: la vía de la única forma que nombra el texto, o ninguna.
    expect(
      viaSinForma(
        "Uso externo: rociar a 15-20 cm sobre la zona.",
        "inhalatoria",
      ),
    ).toBe("uso externo");
    expect(
      viaSinForma(
        "Spray nasal: 2 aplicaciones en cada fosa cada 24 h. Inhalador: 100-500 mcg cada 12 h.",
        "inhalatoria",
      ),
    ).toBe("");
    expect(viaSinForma("10 mg cada 24 h.", "oral")).toBe("oral");
    expect(
      categoriaDeForma("Sprays/Aerosoles", "aerosol p/inhal.x 200 dosis"),
    ).toBe("inhalatorio");
  });
});
