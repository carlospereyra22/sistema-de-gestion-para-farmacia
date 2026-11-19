import {
  compararDosis,
  dosisDe,
  dosisPorNombre,
  formaDePresentacion,
  separarAlternativas,
  unidadesDe,
  type ItemBase,
} from "./equivalentes";

const COMP = "Comprimidos/Pastillas/Tabletas/Grageas";
const CAPS = "Cápsulas/Softgels";
const item = (datos: Partial<ItemBase>): ItemBase => ({
  id: datos.name ?? "x",
  name: "NOVALGINA",
  presentation: "comp.x 10",
  laboratory: "Opella",
  pharmaceuticalForm: COMP,
  priceMinor: 1_000_000n,
  codigos: [],
  ...datos,
});
const sinBase = { itemIds: new Set<string>(), codigos: new Set<string>() };

describe("equivalentes de un medicamento", () => {
  it("cuenta unidades del envase, no volúmenes", () => {
    expect(unidadesDe("comp.x 20")).toBe(20);
    expect(unidadesDe("sob.x 15 x 2")).toBe(30);
    expect(unidadesDe("jbe.x 120 ml")).toBeNull();
    expect(unidadesDe("1 g a.x 100 x 2 ml")).toBe(100);
    expect(unidadesDe("crema")).toBeNull();
  });

  it("lee la dosis de la presentación o del número del nombre", () => {
    const d = (nombre: string, presentacion: string) => {
      const dosis = dosisDe(nombre, presentacion);
      return dosis && { valores: dosis.valores, unidad: dosis.unidad };
    };
    expect(d("ACTRON RAPIDA ACCION NF", "400 mg cáps.x 20")).toEqual({
      valores: [400],
      unidad: "mg",
    });
    expect(d("ACTRON 400 x20 RAPIDA ACCION", "cáps.gelat.blanda x 20")).toEqual(
      { valores: [400], unidad: "" },
    );
    expect(d("ACTRON 400x20", "cáps.x 20")?.valores).toEqual([400]);
    expect(d("ACTRON", "cáps.gelat.blanda x 10")).toBeNull();
    // Combinaciones: todos los componentes.
    expect(d("ALPERTAN D", "320/25 mg comp.rec.x28")).toEqual({
      valores: [320, 25],
      unidad: "mg",
    });
    // Pegadas al texto o detrás de una abreviatura.
    expect(d("XEDENOL", "50mgcomp.rec.gastror.x30")?.valores).toEqual([50]);
    expect(d("VIRIPOTENS M", "frut.50 mg comp.mast.x30")?.valores).toEqual([
      50,
    ]);
    expect(d("OPTAMOX", "Ped.250 mg susp.x 60 ml")?.valores).toEqual([250]);
    expect(d("NODIPIR", "10g% gts.x 20 ml")).toEqual({
      valores: [10],
      unidad: "g%",
    });
    // Un dígito o cinco en el nombre; nunca el envase.
    expect(d("AMLODICORD 5", "comp.ran.x 30")?.valores).toEqual([5]);
    expect(d("DEVISAL CB 50000", "cáps.bl.x 2")?.valores).toEqual([50000]);
    expect(d("4 x 4", "comp.rec.x 4")).toBeNull();
    expect(d("SUMAPROT", "pvo.lata x 250 g")).toBeNull();
  });

  it("completa la dosis con otras presentaciones del mismo nombre y forma", () => {
    expect(
      dosisPorNombre(
        "AMIXEN DUO",
        [
          item({ name: "AMIXEN DUO", presentation: "comp.rec.x 14" }),
          item({ name: "AMIXEN DUO", presentation: "875 mg comp.x 16" }),
        ],
        COMP,
      )?.valores,
    ).toEqual([875]);
    // Si dicen cosas distintas, no se adivina.
    expect(
      dosisPorNombre(
        "Y",
        [
          item({ name: "Y", presentation: "500 mg comp" }),
          item({ name: "Y", presentation: "875 mg comp" }),
        ],
        COMP,
      ),
    ).toBeNull();
    // El jarabe no toma la dosis del comprimido.
    expect(
      dosisPorNombre(
        "ARZOMICIN",
        [item({ name: "ARZOMICIN", presentation: "500 mg comp.rec.x 3" })],
        "Jarabe/Suspensión oral/Polvo para uso oral",
      ),
    ).toBeNull();
  });

  it("lee la dosis sin unidad al principio y en cremas por peso", () => {
    expect(dosisDe("CIAPAR", "500 comp.x 10")?.valores).toEqual([500]);
    expect(dosisDe("JBE", "120 ml")).toBeNull();
    expect(
      compararDosis(
        dosisDe("LAFEVIR", "5 g/100 g cr.dérm.x 10 g"),
        dosisDe("ACICLOVIR", "5% crema x 10 g"),
      ),
    ).toBe("igual");
  });

  it("FORTE, PED. y similares no son iguales sin dosis escrita", () => {
    const { equivalentes } = separarAlternativas(
      { ...sinBase, forma: COMP, dosis: null, nombre: "DIOXAFLEX GESIC" },
      [
        item({ name: "ALGICLER" }),
        item({ name: "OXAGESIC FORTE" }),
        item({ name: "OPTAMOX DUO 14:1" }),
      ],
      new Map(),
    );
    expect(
      equivalentes.map((fila) => [fila.nombre, fila.dosisConfirmada]),
    ).toEqual([
      ["ALGICLER", true],
      ["OXAGESIC FORTE", false],
      ["OPTAMOX DUO 14:1", false],
    ]);
  });

  it("no confunde combinaciones con otra proporción", () => {
    const { equivalentes, mismaDroga } = separarAlternativas(
      {
        ...sinBase,
        forma: COMP,
        dosis: dosisDe("ALPERTAN D", "320/25 mg comp.rec.x28"),
      },
      [
        item({ name: "VALSARFEC D", presentation: "160/25mg comp.x 28" }),
        item({ name: "DILCORAN D", presentation: "320/25 mg comp.rec.x30" }),
      ],
      new Map(),
    );
    expect(equivalentes.map((fila) => fila.nombre)).toEqual(["DILCORAN D"]);
    expect(mismaDroga.map((fila) => fila.nombre)).toEqual(["VALSARFEC D"]);
  });

  it("fórmulas abiertas (+asoc., multivitamínicos): solo relacionados", () => {
    const { equivalentes, mismaDroga } = separarAlternativas(
      { ...sinBase, forma: COMP, dosis: null, composicionAbierta: true },
      [item({ name: "CENTRUM" })],
      new Map(),
    );
    expect(equivalentes).toEqual([]);
    expect(mismaDroga.map((fila) => fila.nombre)).toEqual(["CENTRUM"]);
  });

  it("compara dosis aunque estén en otra unidad", () => {
    const d = dosisDe;
    expect(compararDosis(d("X", "400 mg cáps"), d("SINDOL 400", "cáps"))).toBe(
      "igual",
    );
    expect(compararDosis(d("X", "400 mg cáps"), d("SINDOL 600", "cáps"))).toBe(
      "distinta",
    );
    expect(compararDosis(d("X", "400 mg cáps"), null)).toBe("sin dato");
    expect(
      compararDosis(d("X", "1 g comp.x 10"), d("X", "1000 mg comp.x 10")),
    ).toBe("igual");
    expect(
      compararDosis(
        d("IBUPIRAC 2%", "susp.x 100 ml"),
        d("X", "100 mg/5 ml susp.x 100 ml"),
      ),
    ).toBe("igual");
    expect(
      compararDosis(
        d("ACTRON PEDIATRICO 4%", "susp.x 100 ml"),
        d("X", "100 mg/5 ml susp.x 100 ml"),
      ),
    ).toBe("distinta");
    // Dos sin dosis escrita: iguales solo si la droga casi nunca la escribe.
    expect(compararDosis(null, null)).toBe("igual");
    expect(compararDosis(null, null, false)).toBe("sin dato");
  });

  it("deduce la forma de la abreviatura de la presentación", () => {
    expect(formaDePresentacion("cáps.gelat.blanda x 20")).toBe(CAPS);
    expect(formaDePresentacion("comp.rec.x 30")).toBe(COMP);
    expect(formaDePresentacion("jbe.x 120 ml")).toMatch(/^Jarabe/);
    expect(formaDePresentacion("comp.lib.prol.x 30")).toMatch(/Liberación/);
  });

  it("arma los equivalentes de Actron 400 como Previta", () => {
    const { equivalentes, mismaDroga } = separarAlternativas(
      {
        ...sinBase,
        forma: formaDePresentacion("cáps.gelat.blanda x 20"),
        dosis: dosisDe(
          "ACTRON 400 x20 RAPIDA ACCION",
          "cáps.gelat.blanda x 20",
        ),
      },
      [
        item({
          name: "ACTRON  400 RAPIDA ACCION NF",
          presentation: "400 mg cáps.x 10 promo",
          pharmaceuticalForm: CAPS,
          priceMinor: 297_900n,
        }),
        item({
          name: "FABOGESIC 400 RAPIDA ACCION",
          presentation: "cáps.gelatin.blanda x 10",
          pharmaceuticalForm: CAPS,
          priceMinor: 409_900n,
        }),
        item({
          name: "SINDOL 400 VL",
          presentation: "400 mg cáps.blandas x 10",
          pharmaceuticalForm: CAPS,
          priceMinor: 415_753n,
        }),
        item({
          name: "ACTRON",
          presentation: "cáps.gelat.blanda x 10",
          pharmaceuticalForm: CAPS,
          priceMinor: 426_000n,
        }),
        item({
          name: "ACTRON 600 RAPIDA ACCION",
          presentation: "cáps.gelat.blanda x 10",
          pharmaceuticalForm: CAPS,
        }),
        item({
          name: "IBU 400",
          presentation: "400mg comp.x500 bl.50x10",
          pharmaceuticalForm: COMP,
        }),
      ],
      new Map(),
    );
    expect(equivalentes.map((fila) => fila.nombre)).toEqual([
      "ACTRON  400 RAPIDA ACCION NF",
      "FABOGESIC 400 RAPIDA ACCION",
      "SINDOL 400 VL",
      "ACTRON",
    ]);
    // Sin dosis escrita: entra, pero para confirmar.
    expect(equivalentes.at(-1)?.dosisConfirmada).toBe(false);
    expect(mismaDroga.map((fila) => fila.nombre).sort()).toEqual([
      "ACTRON 600 RAPIDA ACCION",
      "IBU 400",
    ]);
  });

  it("dipironas: comprimidos sin dosis escrita son equivalentes entre sí", () => {
    const { equivalentes, mismaDroga } = separarAlternativas(
      {
        itemIds: new Set(["NOVALGINA"]),
        codigos: new Set(),
        forma: COMP,
        dosis: null,
      },
      [
        item({ id: "NOVALGINA" }),
        item({ name: "DIOXADOL", priceMinor: 957_600n }),
        item({
          name: "NOVEMINA",
          presentation: "comp.x 40",
          priceMinor: 2_878_600n,
        }),
        item({
          name: "NOVACLER",
          presentation: "jbe.x 200 ml",
          pharmaceuticalForm: "Jarabe",
        }),
        item({ name: "DIPIRONA 1 G", presentation: "1 g comp.x 10" }),
      ],
      new Map(),
    );
    expect(equivalentes.map((fila) => fila.nombre)).toEqual([
      "NOVEMINA",
      "DIOXADOL",
    ]);
    expect(equivalentes[0]?.precioPorUnidadMinor).toBe("71965");
    expect(equivalentes.every((fila) => fila.dosisConfirmada)).toBe(true);
    expect(mismaDroga.map((fila) => fila.nombre).sort()).toEqual([
      "DIPIRONA 1 G",
      "NOVACLER",
    ]);
  });

  it("muestra el precio y el stock de la farmacia cuando tiene el producto", () => {
    const { equivalentes } = separarAlternativas(
      { ...sinBase, forma: COMP, dosis: null },
      [item({ name: "CON STOCK", priceMinor: 900n, codigos: ["2"] })],
      new Map([
        ["2", { id: "p", nombre: "CON STOCK", precioMinor: 1_200n, stock: 5 }],
      ]),
    );
    expect(equivalentes[0]?.producto).toEqual({
      id: "p",
      nombre: "CON STOCK",
      precioMinor: "1200",
      stock: 5,
    });
    expect(equivalentes[0]?.precioPorUnidadMinor).toBe("120");
  });
});
