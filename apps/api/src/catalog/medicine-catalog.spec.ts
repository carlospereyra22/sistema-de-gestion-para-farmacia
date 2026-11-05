import {
  alfaBetaRowKey,
  aliasKey,
  catalogSearchWords,
  compactKey,
  decideSourceRow,
  officialCatalogRows,
  parseRemediesRows,
  planOfficialUpdates,
  referenceFromCatalog,
  remediesHasMorePages,
  type CatalogItemForRefresh,
} from "./medicine-catalog";

function item(
  overrides: Partial<CatalogItemForRefresh> = {},
): CatalogItemForRefresh {
  return {
    id: "item",
    externalKey: "ab-1",
    name: "ACTRON 400",
    presentation: "cáps.x 10",
    laboratory: "Bayer",
    priceSource: "official",
    priceMinor: 900000n,
    referenceUrl: null,
    sourceRowKey: "",
    troquel: "",
    officialDelisted: false,
    barcodes: [{ barcode: "7793640215479" }],
    ...overrides,
  };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  CLAVE: 1,
  NOMBRE: "ACTRON 400",
  PRESENTACION: "cáps.x 10",
  C_BARRA: "7793640215479",
  GTIN1: "",
  TROQUEL: "123",
  PRECIO: 9500,
  BAJA: 0,
  ...overrides,
});

const plan = (
  items: CatalogItemForRefresh[],
  rows: Record<string, unknown>[],
) => planOfficialUpdates(items, officialCatalogRows(rows));

describe("cruce de la base con el padrón", () => {
  it("toma el precio por CLAVE aunque cambie el código", () => {
    const result = plan([item()], [row({ C_BARRA: "7790000000000" })]);
    expect(result.updates).toEqual([
      expect.objectContaining({
        id: "item",
        priceMinor: "950000",
        priceSource: "official",
        troquel: "123",
      }),
    ]);
  });

  it("sin CLAVE cruza por código, ignorando los ceros a la izquierda", () => {
    const result = plan(
      [item({ barcodes: [{ barcode: "07793640215479" }] })],
      [row({ CLAVE: 99 })],
    );
    expect(result.updates).toHaveLength(1);
  });

  it("no descarta un código con dígito de control inválido", () => {
    const result = plan(
      [item({ barcodes: [{ barcode: "7790000000001" }] })],
      [row({ CLAVE: 99, C_BARRA: "7790000000001" })],
    );
    expect(result.updates).toHaveLength(1);
  });

  it("por último cruza por nombre y presentación si hay una sola fila", () => {
    const sinCodigo = { CLAVE: 99, C_BARRA: "7790000000002" };
    expect(plan([item()], [row(sinCodigo)]).updates).toHaveLength(1);
    expect(
      plan(
        [item()],
        [row(sinCodigo), row({ CLAVE: 98, C_BARRA: "7790000000003" })],
      ).updates,
    ).toHaveLength(0);
  });

  it("el nombre solo vale para lo que ya viene del padrón", () => {
    const result = plan(
      [
        item({
          priceSource: "preciosderemedios",
          referenceUrl: "https://link",
        }),
      ],
      [row({ CLAVE: 99, C_BARRA: "7790000000002" })],
    );
    expect(result.updates).toHaveLength(0);
  });

  it("un dado de baja con precio toma el del padrón y queda marcado", () => {
    const result = plan(
      [
        item({
          priceSource: "preciosderemedios",
          referenceUrl: "https://link",
          sourceRowKey: "fila",
        }),
      ],
      [row({ BAJA: 1, PRECIO: 6632 })],
    );
    expect(result.updates).toEqual([
      expect.objectContaining({
        priceMinor: "663200",
        priceSource: "official",
        referenceUrl: null,
        officialDelisted: true,
      }),
    ]);
    expect(result.delisted).toEqual([]);
  });

  it("un dado de baja sin precio se marca y sigue con su fuente", () => {
    const result = plan(
      [
        item({
          priceSource: "preciosderemedios",
          referenceUrl: "https://link",
        }),
      ],
      [row({ BAJA: 1, PRECIO: "" })],
    );
    expect(result.updates).toHaveLength(0);
    expect(result.delisted).toEqual(["item"]);
  });

  it("no vuelve a marcar lo que ya está dado de baja", () => {
    const result = plan(
      [item({ officialDelisted: true })],
      [row({ BAJA: 1, PRECIO: "" })],
    );
    expect(result.delisted).toEqual([]);
  });

  it("una fila dada de baja no sirve para cruzar por código", () => {
    const result = plan([item()], [row({ CLAVE: 99, BAJA: 1 })]);
    expect(result.updates).toHaveLength(0);
    expect(result.delisted).toEqual([]);
  });

  it("si el padrón vuelve a informarlo, deja de estar de baja", () => {
    const result = plan([item({ officialDelisted: true })], [row()]);
    expect(result.updates[0]?.officialDelisted).toBe(false);
  });

  it("si un producto de Remedios aparece en el padrón, pasa al padrón", () => {
    const result = plan(
      [
        item({
          priceSource: "preciosderemedios",
          referenceUrl: "https://link",
          sourceRowKey: "fila",
        }),
      ],
      [row()],
    );
    expect(result.updates[0]).toEqual(
      expect.objectContaining({
        priceSource: "official",
        referenceUrl: null,
        sourceRowKey: "",
      }),
    );
  });

  it("una fila sin precio conserva el precio guardado", () => {
    expect(plan([item()], [row({ PRECIO: "" })]).updates).toHaveLength(0);
    expect(plan([item()], [row({ PRECIO: 0 })]).updates).toHaveLength(0);
  });
});

const remediesHtml = `
<tr class="border-b" data-price="32950"><td><div class="product-text" title="ACALIX A.P. 120mg Caps. x 30"><span class="font-bold text-gray-900">ACALIX A.P.</span> <span class="font-normal text-gray-600">120mg Caps. x 30</span></div></td><td><div class="laboratorio-text responsive-text">ROEMMERS</div></td></tr>
<tr class="border-b" data-price="34447.5"><td><div class="product-text"><span class="font-bold text-gray-900">ACALIX CRONOS</span> <span class="font-normal text-gray-600">180mg Caps. x 30</span></div></td><td><div class="laboratorio-text responsive-text">ROEMMERS</div></td></tr>`;

describe("lectura de Precios de Remedios", () => {
  it("lee nombre, presentación, laboratorio y precio de cada fila", () => {
    expect(parseRemediesRows(remediesHtml)).toEqual([
      {
        rowKey: compactKey("ACALIX A.P. 120mg Caps. x 30"),
        laboratory: "ROEMMERS",
        priceMinor: 3295000,
      },
      {
        rowKey: compactKey("ACALIX CRONOS 180mg Caps. x 30"),
        laboratory: "ROEMMERS",
        priceMinor: 3444750,
      },
    ]);
  });

  it("detecta si quedan páginas aunque el número venga en otra etiqueta", () => {
    expect(
      remediesHasMorePages("Mostrando <b>1-15</b>  de  <b>36</b> resultados"),
    ).toBe(true);
    expect(remediesHasMorePages("Mostrando 31-36 de 36")).toBe(false);
    expect(remediesHasMorePages("Sin resultados")).toBe(false);
  });
});

describe("decisión de precio por link", () => {
  const linked = {
    sourceRowKey: "fila",
    laboratory: "Elea",
    priceMinor: 100000n,
    priceSource: "preciosderemedios",
  };
  const source = (priceMinor: number | null, laboratory = "ELEA") => ({
    rowKey: "fila",
    laboratory,
    priceMinor,
  });

  it("aplica el precio de la fila guardada", () => {
    expect(decideSourceRow(linked, [source(120000)], new Map())).toEqual({
      kind: "price",
      priceMinor: 120000n,
    });
  });

  it("sin la fila conserva el precio", () => {
    expect(
      decideSourceRow(
        linked,
        [{ ...source(120000), rowKey: "otra" }],
        new Map(),
      ),
    ).toEqual({ kind: "missing" });
  });

  it("dos filas iguales con el mismo precio cuentan una vez", () => {
    expect(
      decideSourceRow(linked, [source(120000), source(120000)], new Map()).kind,
    ).toBe("price");
  });

  it("dos filas con precios distintos no se pueden decidir", () => {
    expect(
      decideSourceRow(linked, [source(120000), source(130000)], new Map()).kind,
    ).toBe("missing");
  });

  it.each(["duda", "distinto"])("descarta un laboratorio en %s", (status) => {
    const aliases = new Map([[aliasKey("Elea", "OTRO"), status]]);
    expect(
      decideSourceRow(linked, [source(120000, "OTRO")], aliases).kind,
    ).toBe("missing");
  });

  it("con un alias bloqueado se queda con la fila del laboratorio correcto", () => {
    const aliases = new Map([[aliasKey("Elea", "OTRO"), "distinto"]]);
    expect(
      decideSourceRow(
        linked,
        [source(500000, "OTRO"), source(120000)],
        aliases,
      ),
    ).toEqual({ kind: "price", priceMinor: 120000n });
  });

  it.each([49999, 200001])(
    "un salto de precio no se aplica: %i queda para revisar",
    (price) => {
      expect(decideSourceRow(linked, [source(price)], new Map()).kind).toBe(
        "review",
      );
    },
  );

  it.each([50000, 200000])("acepta el límite del control: %i", (price) => {
    expect(decideSourceRow(linked, [source(price)], new Map()).kind).toBe(
      "price",
    );
  });
});

describe("filas de AlfaBeta", () => {
  it("ignora la condición de venta que agrega al final", () => {
    expect(alfaBetaRowKey("comp.rec.x 14 (VL)")).toBe(
      compactKey("comp.rec.x 14"),
    );
  });

  it("conserva un paréntesis que es parte de la presentación", () => {
    expect(alfaBetaRowKey("vainilla x 2 lb.(930 g)")).toBe(
      compactKey("vainilla x 2 lb.(930 g)"),
    );
  });
});

describe("referencia para la web", () => {
  const stored = {
    name: "PANGEST 20",
    presentation: "20 mg comp.rec.x 14",
    laboratory: "Beta",
    activeIngredient: "pantoprazol",
    pharmaceuticalForm: "Comprimidos",
    saleCondition: "Venta Bajo Receta",
    troquel: "",
    priceSource: "alfabeta",
    priceMinor: 648736n,
    referenceUrl: "https://www.alfabeta.net/precio/pangest-20.html",
    officialDelisted: true,
    laboratoryMismatch: "Beta / MEGALABS ARG.",
    priceUpdatedAt: new Date("2026-11-04T12:00:00Z"),
  };

  it("lleva fuente, link y marcas", () => {
    expect(referenceFromCatalog(stored, "7795328054172")).toEqual(
      expect.objectContaining({
        source: "alfabeta",
        barcode: "7795328054172",
        priceMinor: 648736,
        referenceUrl: stored.referenceUrl,
        officialDelisted: true,
        laboratoryMismatch: "Beta / MEGALABS ARG.",
        prescriptionRequired: true,
        concentration: "20 mg",
      }),
    );
  });

  it("venta libre no pide receta", () => {
    expect(
      referenceFromCatalog({ ...stored, saleCondition: "Venta Libre" }, "")
        .prescriptionRequired,
    ).toBe(false);
  });
});

describe("palabras de búsqueda", () => {
  it("normaliza acentos y descarta letras sueltas", () => {
    expect(catalogSearchWords("Ibuprofeno  x 400 Bagó")).toEqual([
      "ibuprofeno",
      "400",
      "bago",
    ]);
  });
});
