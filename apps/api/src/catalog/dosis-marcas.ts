// Dosis de las marcas que el padrón no escribe ("ACTRON cáps.gelat.blanda"),
// tomada de la composición publicada en AlfaBeta (SISTEMA-108). Reglas puras:
// ver docs/PRODUCTS.md. Solo se acepta sin ambigüedad: si hay dudas, nada.

function normalizado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

// "IBU EVANOL RAPIDA ACCION" → "ibu-evanol-rapida-accion".
export function slugAlfaBeta(nombre: string): string {
  return normalizado(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function leerFichaAlfaBeta(html: string): {
  titulo: string;
  composicion: string;
} {
  const titulo = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  const composicion =
    /<b>\s*COMPOSICI[OÓ]N:\s*<\/b>([\s\S]*?)<\/span>/i.exec(html)?.[1] ?? "";
  return { titulo: textoPlano(titulo), composicion: textoPlano(composicion) };
}

export function mismoNombre(titulo: string, nombre: string): boolean {
  return !!titulo && normalizado(titulo) === normalizado(nombre);
}

// Número de la ficha: "5.000" es cinco mil (separador de miles), "0,5" es
// medio. Devuelve el texto con punto decimal: "5000", "0.5".
const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+(?![\d,])|\d+(?:[.,]\d+)?`;
function aNumero(texto: string): string {
  return /^\d{1,3}(?:\.\d{3})+$/.test(texto)
    ? texto.replace(/\./g, "")
    : texto.replace(",", ".");
}

// "Cada cápsula blanda de gelatina contiene: Ibuprofeno 400 mg." → "400 mg".
// Combinaciones: "10 mg; Paracetamol 500 mg" → "10/500 mg" cuando la cantidad
// de valores coincide con los componentes y la unidad es la misma. Si la ficha
// describe varias formas ("Comprimidos: ... Jarabe: ..."), no se elige.
export function dosisDeComposicion(
  composicion: string,
  componentes: number,
): string | null {
  const texto = normalizado(composicion);
  if (!texto) return null;
  if ((texto.match(/\bcada\b/g) ?? []).length > 1) return null;
  const principal = texto.split(/excipientes?|c\.s\.p?|csp/)[0] ?? "";
  const valores: { numero: string; unidad: string }[] = [];
  for (const coincidencia of principal.matchAll(
    new RegExp(
      String.raw`(${NUMERO})\s*(mcg|ug|µg|mg|g|ui|u\.i\.)(?![a-z])`,
      "g",
    ),
  )) {
    valores.push({
      numero: aNumero(coincidencia[1] ?? ""),
      unidad: (coincidencia[2] ?? "").replace("u.i.", "ui"),
    });
  }
  if (!valores.length || valores.length !== componentes) return null;
  const unidades = new Set(valores.map((valor) => valor.unidad));
  if (unidades.size !== 1) return null;
  return `${valores.map((valor) => valor.numero).join("/")} ${valores[0]?.unidad}`;
}

// Forma de la presentación ↔ cómo la nombra la composición. Las fichas que
// describen varias formas ("Comprimidos: Cada comprimido… Solución oral
// (gotas): Cada 100 ml…") se parten y la dosis va solo a la parte de la misma
// forma.
const FORMAS: { presentacion: RegExp; parte: RegExp; liquida?: boolean }[] = [
  { presentacion: /caps|perla/, parte: /cada\s+(capsula|perla)/ },
  { presentacion: /grag/, parte: /cada\s+gragea/ },
  { presentacion: /comp|tab/, parte: /cada\s+(comprimido|tableta)/ },
  { presentacion: /\bsob|sobre/, parte: /cada\s+sobre/ },
  { presentacion: /\bov\.|ovulo/, parte: /cada\s+ovulo/ },
  { presentacion: /supos/, parte: /cada\s+supositorio/ },
  { presentacion: /parch/, parte: /cada\s+parche/ },
  { presentacion: /\bgts|\bgtas|gotas/, parte: /gotas/, liquida: true },
  { presentacion: /\bjbe|jarabe/, parte: /jarabe/, liquida: true },
  { presentacion: /\bsusp/, parte: /suspension/, liquida: true },
  {
    presentacion: /\ba\.|amp|iny|f\.a\.|vial/,
    parte: /cada\s+(ampolla|frasco ampolla|vial)|inyectable/,
    liquida: true,
  },
];

const LIQUIDA = /\b(gts|gtas|gotas|jbe|jarabe|susp|sol)\b/;
const POR_ML = /cada\s+(\d+(?:[.,]\d+)?\s*)?ml\b/;

// Cada "Cada …" con el encabezado que lo precede: lo que sigue al último
// "c.s." o punto de la parte anterior ("Solución oral (gotas):").
export function partesDeComposicion(composicion: string): string[] {
  const texto = normalizado(composicion);
  const inicios = [...texto.matchAll(/\bcada\b/g)].map(
    (coincidencia) => coincidencia.index ?? 0,
  );
  // Lo que va antes de cada "cada": el encabezado es el final de ese tramo.
  const encabezados = inicios.map((inicio, posicion) => {
    const anterior = texto.slice(
      posicion ? (inicios[posicion - 1] ?? 0) : 0,
      inicio,
    );
    return posicion ? (anterior.split(/c\.s\.p?|\.\s/).at(-1) ?? "") : anterior;
  });
  return inicios.map((inicio, posicion) => {
    const siguiente = inicios[posicion + 1];
    // El cuerpo termina donde empieza el encabezado de la parte siguiente.
    const fin =
      siguiente === undefined
        ? texto.length
        : siguiente - (encabezados[posicion + 1] ?? "").length;
    return `${(encabezados[posicion] ?? "").trim()} ${texto.slice(inicio, fin)}`.trim();
  });
}

const A_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  mcg: 0.001,
  ug: 0.001,
  µg: 0.001,
};

// "cada 100 ml contiene: dipirona 50 g" → "500 mg/ml"; "cada ml…500 mg" →
// "500 mg/ml". Solo una droga y unidades de peso.
function concentracionPorMl(parte: string): string | null {
  const volumen = POR_ML.exec(parte);
  if (!volumen) return null;
  const mililitros = Number((volumen[1] ?? "1").trim().replace(",", "."));
  const principal = parte.split(/excipientes?|c\.s\.p?|csp/)[0] ?? "";
  const valores = [
    ...principal.matchAll(
      new RegExp(String.raw`(${NUMERO})\s*(mcg|ug|µg|mg|g)(?![a-z])`, "g"),
    ),
  ];
  if (valores.length !== 1 || !mililitros) return null;
  const [, numero = "", unidad = ""] = valores[0] ?? [];
  const miligramos =
    (Number(aNumero(numero)) * (A_MG[unidad] ?? 0)) / mililitros;
  if (!Number.isFinite(miligramos) || miligramos <= 0) return null;
  return `${Number(miligramos.toFixed(3))} mg/ml`;
}

// La dosis para una presentación concreta. Comprimidos, cápsulas, ampollas…:
// la cantidad por unidad ("400 mg"). Gotas, jarabes, suspensiones: la
// concentración por ml ("500 mg/ml"). Solo si la composición habla de esa
// misma forma; ante cualquier duda, nada.
export function dosisParaPresentacion(
  composicion: string,
  componentes: number,
  presentacion: string,
): string | null {
  const textoPresentacion = normalizado(presentacion);
  const forma = FORMAS.find((item) =>
    item.presentacion.test(textoPresentacion),
  );
  if (!forma) return null;
  const partes = partesDeComposicion(composicion);
  let elegidas = partes.filter((parte) => forma.parte.test(parte));
  // Una sola parte líquida sin decir la forma ("Cada 100 ml contiene…") vale
  // para la presentación líquida de esa marca.
  if (
    !elegidas.length &&
    forma.liquida &&
    LIQUIDA.test(textoPresentacion) &&
    partes.length === 1 &&
    POR_ML.test(partes[0] ?? "")
  )
    elegidas = partes;
  if (elegidas.length !== 1) return null;
  const parte = elegidas[0] ?? "";
  if (POR_ML.test(parte))
    return forma.liquida && componentes === 1
      ? concentracionPorMl(parte)
      : null;
  if (/cada\s+\d/.test(parte)) return null;
  return dosisDeComposicion(parte, componentes);
}
