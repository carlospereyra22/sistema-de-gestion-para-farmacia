// La dosis guardada es por principio activo, pero cada presentación tiene su
// forma: la de los comprimidos no sirve para la ampolla ni para el gel
// (SISTEMA-108). Reglas puras: ver docs/PRODUCTS.md.

export type CategoriaForma =
  | "solido"
  | "liquido"
  | "inyectable"
  | "topico"
  | "oftalmico"
  | "otico"
  | "nasal"
  | "inhalatorio"
  | "vaginal"
  | "rectal"
  | "transdermico"
  | "bucal";

function normalizado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

// Forma del padrón ("Jarabe/Suspensión oral/Polvo para uso oral") o, si no
// hay, abreviatura de la presentación ("jbe.x 100 ml"). El orden importa:
// "Cápsulas/Softgels" no es un gel.
const POR_FORMA: [RegExp, CategoriaForma][] = [
  [/oftalm/, "oftalmico"],
  [/gotas oticas/, "otico"],
  [/nasal/, "nasal"],
  [/nebuliz|para inhalar|diskus/, "inhalatorio"],
  [/ampollas bebibles|jarabe|gotas orales/, "liquido"],
  [/ampollas\/|jeringa|autoinyector|parent/, "inyectable"],
  [/ovulos|vaginal/, "vaginal"],
  [/supositorio|enema|rectal/, "rectal"],
  [/parches/, "transdermico"],
  [/colutorio|buches|caramelos|chicles/, "bucal"],
  [/capsula|caps\.|comprimido|granulado|tableta/, "solido"],
  [
    /crema|gel|pomada|unguento|uso externo|locion|emulsion|espuma|shampoo|jabon|talco/,
    "topico",
  ],
];

const POR_PRESENTACION: [RegExp, CategoriaForma][] = [
  [/colirio|oftalm|\bgts\.? ?oft/, "oftalmico"],
  [/otic/, "otico"],
  [/nasal/, "nasal"],
  [/aerosol|inhal|nebul/, "inhalatorio"],
  [/\b(jbe|jarabe|gts|gtas|gotas|susp|sol\.? ?oral|elixir)\b/, "liquido"],
  [/\ba\.x|\bamp|\biny|\bf\.a\.|\bvial|jer\.prell/, "inyectable"],
  [/\bov\.|ovulo/, "vaginal"],
  [/supos|enema/, "rectal"],
  [/parch/, "transdermico"],
  [/caram|pastill|colut/, "bucal"],
  [/\b(comp|caps|cap|grag|tab|sob|comprimidos|capsulas)\b/, "solido"],
  [/crema|gel\b|pom\.|pomada|ung\.|loc\.|locion|emul|champ|shamp/, "topico"],
];

export function categoriaDeForma(
  forma?: string | null,
  presentacion?: string | null,
  // El nombre también aclara: "EVACARE CREMA VAGINAL" con "crema x 35 g".
  nombre?: string | null,
): CategoriaForma | null {
  const textoForma = normalizado(forma ?? "");
  const textoPresentacion = normalizado(presentacion ?? "");
  const aclaracion = `${textoPresentacion} ${normalizado(nombre ?? "")}`;
  // La presentación aclara lo que la forma del padrón agrupa: "crema vag.",
  // "spray nasal" o "ung.oft." no son de la piel ni para inhalar.
  if (/\bvag/.test(aclaracion)) return "vaginal";
  if (/\boft|oftalm|colirio/.test(aclaracion)) return "oftalmico";
  if (/nasal/.test(aclaracion)) return "nasal";
  if (/\botic/.test(aclaracion)) return "otico";
  // "Sprays/Aerosoles" agrupa inhaladores con sprays de uso externo (frío
  // local, antisépticos): para inhalar sólo si la presentación lo dice.
  // El padrón junta en "Sprays/Aerosoles" inhaladores, sprays nasales y de uso
  // externo: sólo se decide si la presentación lo dice; si no, sin forma.
  if (/sprays\/aerosoles/.test(textoForma))
    return /inhal|nebu|hfa|puff|ellipta|diskus|turbuhaler|breezhaler|respimat|aerocamara/.test(
      aclaracion,
    )
      ? "inhalatorio"
      : null;
  // Sobres para tomar que el padrón agrupa con los polvos de uso rectal.
  if (/\bsob(res?)?\b/.test(textoPresentacion) && /rectal/.test(textoForma))
    return "solido";
  for (const [regla, categoria] of POR_FORMA)
    if (regla.test(textoForma)) return categoria;
  for (const [regla, categoria] of POR_PRESENTACION)
    if (regla.test(textoPresentacion)) return categoria;
  return null;
}

// Etiquetas de forma dentro de la dosis ("Gel: …", "Inyectable: …"). Las
// etiquetas que no son formas ("Niños:", "Uso hospitalario:") no cortan.
const ETIQUETAS: [RegExp, CategoriaForma[]][] = [
  [/^(gotas para oido|oido)\b/, ["otico"]],
  [/oftalm|^(colirio|ojo|examen de ojos|miopia)/, ["oftalmico"]],
  [/^(spray|pomada|gotas|gel|lavado|aerosol)? ?nasal/, ["nasal"]],
  [/^(inhala|nebuliz)/, ["inhalatorio"]],
  [/^(suspension bucal)/, ["bucal", "liquido"]],
  [/bucal|^(enjuague|chicle|pastillas)/, ["bucal"]],
  // "Candidiasis vaginal:" es una indicación (fluconazol oral), no una forma.
  [/^(ovulo|(crema|gel|comprimidos?) vaginal|vaginal)/, ["vaginal"]],
  [/^(supositorio|enema)/, ["rectal"]],
  [/^parche/, ["transdermico"]],
  [/^(inyect|inyeccion|endovenoso|intramuscular)/, ["inyectable"]],
  [/^(jarabe|suspension|solucion oral)\b/, ["liquido"]],
  [
    /^(oral|comprimidos?|capsulas?|liberacion|sublingual|sobres?)\b/,
    ["solido", "liquido"],
  ],
  [
    /^(crema|gel|pomada|locion|champu|capilar|topic|piel|laca|unguento|uso externo)/,
    ["topico"],
  ],
];

function categoriasDeEtiqueta(
  etiqueta: string,
  via: string,
): CategoriaForma[] | null {
  const texto = normalizado(etiqueta);
  // "Gotas:" son orales si la vía es oral; si no, de ojo, oído o nariz.
  if (texto === "gotas")
    return normalizado(via) === "oral"
      ? ["liquido"]
      : ["oftalmico", "otico", "nasal"];
  return ETIQUETAS.find(([regla]) => regla.test(texto))?.[1] ?? null;
}

// Formas a las que se refiere un texto sin etiqueta, según la vía del
// padrón. Vía desconocida: se acepta cualquiera.
function categoriasDeVia(via: string, texto: string): CategoriaForma[] | null {
  const v = normalizado(via);
  if (v === "oral") return ["solido", "liquido", "bucal"];
  if (v.startsWith("inyectable") || /intra|epidural/.test(v))
    return /intraocular/.test(v) ? ["oftalmico"] : ["inyectable"];
  if (v === "inhalatoria") return ["inhalatorio"];
  if (v === "nasal") return ["nasal"];
  // Cremas vaginales y hemorroidales vienen como cremas en el padrón.
  if (v === "vaginal") return ["vaginal", "topico"];
  if (v === "rectal") return ["rectal", "topico"];
  if (v === "transdermal") return ["transdermico", "topico"];
  if (v === "uso externo") {
    const t = normalizado(texto);
    const lista: CategoriaForma[] = ["topico", "bucal"];
    const gotas = /\bgotas?\b/.test(t);
    if (gotas || /\bojo|colirio|oftalm|parpado/.test(t))
      lista.push("oftalmico");
    if (gotas || /\boido/.test(t)) lista.push("otico");
    if (gotas || /nariz|fosa|nasal/.test(t)) lista.push("nasal");
    if (/vaginal|ovulo/.test(t)) lista.push("vaginal");
    return lista;
  }
  return null;
}

export type DosisDeForma = {
  /** Lo que aplica a esta presentación; vacío si la dosis es de otra forma. */
  dosis: string;
  /** La dosis guardada es de otra forma: se remite al prospecto. */
  otraForma: boolean;
};

// Elige de la dosis guardada la parte de la forma de la presentación.
export function dosisParaForma(
  dosis: string,
  via: string,
  categoria: CategoriaForma | null,
): DosisDeForma {
  if (!dosis || !categoria) return { dosis, otraForma: false };
  const partes: { categorias: CategoriaForma[] | null; texto: string }[] = [
    { categorias: null, texto: "" },
  ];
  const etiqueta = /(^|[.;]\s+)([A-ZÁÉÍÓÚÑ][^.:;]{0,45}):\s*/g;
  let desde = 0;
  for (const coincidencia of dosis.matchAll(etiqueta)) {
    const categorias = categoriasDeEtiqueta(coincidencia[2] ?? "", via);
    if (!categorias) continue;
    const inicio = (coincidencia.index ?? 0) + (coincidencia[1] ?? "").length;
    partes[partes.length - 1]!.texto += dosis.slice(desde, inicio);
    partes.push({ categorias, texto: "" });
    desde = inicio;
  }
  partes[partes.length - 1]!.texto += dosis.slice(desde);
  const propias = partes.filter((parte) =>
    parte.categorias?.includes(categoria),
  );
  const general = generalParaForma(partes[0]!.texto.trim(), via, categoria);
  // La parte general (sin etiqueta) va primero si también es de esta forma:
  // "50-100 mg cada 6 h. Liberación prolongada: cada 12 h." en comprimidos.
  const textos = [general, ...propias.map((parte) => parte.texto.trim())];
  const dosisFinal = textos.filter(Boolean).join(" ");
  return dosisFinal
    ? { dosis: dosisFinal, otraForma: false }
    : { dosis: "", otraForma: true };
}

// El texto sin etiqueta, si corresponde a la forma de la presentación.
function generalParaForma(
  general: string,
  via: string,
  categoria: CategoriaForma,
): string {
  if (!general) return "";
  const texto = normalizado(general);
  // Textos que ya remiten al envase valen para cualquier forma.
  if (/segun (el|la) (producto|envase|presentacion)/.test(texto))
    return general;
  const vias = categoriasDeVia(via, general);
  if (vias && !vias.includes(categoria)) return "";
  // Un líquido no se toma "1 comprimido cada 24 h" (salvo que también diga
  // los ml: "10-20 ml o 1-2 comprimidos").
  if (
    categoria === "liquido" &&
    /\b(comprimidos?|capsulas?|grageas?|perlas?)\b/.test(texto) &&
    !/\bml\b/.test(texto)
  )
    return "";
  return general;
}

const VIA_DE_CATEGORIA: Record<CategoriaForma, string> = {
  solido: "oral",
  liquido: "oral",
  bucal: "bucal",
  inyectable: "inyectable",
  topico: "uso externo",
  oftalmico: "oftálmica",
  otico: "ótica",
  nasal: "nasal",
  inhalatorio: "inhalatoria",
  vaginal: "vaginal",
  rectal: "rectal",
  transdermico: "transdérmica",
};

// Vía que se muestra: la del padrón si corresponde a la forma; si no, la de
// la forma (una ampolla de dipirona no es "oral").
export function viaParaForma(
  via: string,
  categoria: CategoriaForma | null,
): string {
  if (!categoria) return via;
  const vias = categoriasDeVia(via, "");
  if (!vias || vias.includes(categoria)) return via;
  return VIA_DE_CATEGORIA[categoria];
}

// Marcas que por el nombre son combinaciones ("COMPUESTO", "COMPOSITUM",
// "DUO", "PLUS") pero quedaron con la guía de una sola droga: la dosis de esa
// droga sola no sirve para la combinación.
export function esCombinacionConGuiaSimple(
  nombre: string,
  guia: { activeIngredient: string },
): boolean {
  const combinada = /\b(compuest[oa]|compositum|duo|plus)\b/.test(
    normalizado(nombre),
  );
  return combinada && !guia.activeIngredient.includes("+");
}

/**
 * "Para qué sirve" de la forma de la presentación cuando el texto separa usos
 * por forma ("Colirio: ojo seco. Crema o polvo: adhesivo dental."). Sin
 * etiquetas de forma, o si ninguna es de esta forma, el texto completo.
 */
export function usoParaForma(
  uso: string,
  via: string,
  categoria: CategoriaForma | null,
): string {
  if (!uso || !categoria) return uso;
  const etiqueta = /(^|[.;]\s+)([A-ZÁÉÍÓÚÑ][^.:;]{0,45}):\s*/g;
  const conEtiqueta = [...uso.matchAll(etiqueta)].some(
    (coincidencia) => categoriasDeEtiqueta(coincidencia[2] ?? "", via) !== null,
  );
  if (!conEtiqueta) return uso;
  const propia = dosisParaForma(uso, via, categoria);
  return propia.otraForma || !propia.dosis ? uso : propia.dosis;
}

/** Formas que nombran las etiquetas de un texto ("Spray nasal:", "Inhalador:"). */
export function formasDelTexto(texto: string, via: string): CategoriaForma[] {
  const etiqueta = /(^|[.;]\s+)([A-ZÁÉÍÓÚÑ][^.:;]{0,45}):\s*/g;
  const formas = new Set<CategoriaForma>();
  for (const coincidencia of texto.matchAll(etiqueta))
    for (const forma of categoriasDeEtiqueta(coincidencia[2] ?? "", via) ?? [])
      formas.add(forma);
  return [...formas];
}

/**
 * Vía que se muestra cuando la forma de la presentación no se pudo decidir: la
 * de la única forma que nombra el texto ("Uso externo: rociar…"); si nombra
 * varias, ninguna (mejor nada que una vía equivocada); sin etiquetas, la del
 * padrón.
 */
export function viaSinForma(texto: string, via: string): string {
  const formas = formasDelTexto(texto, via);
  if (!formas.length) return via;
  const vias = new Set(formas.map((forma) => VIA_DE_CATEGORIA[forma]));
  return vias.size === 1 ? [...vias][0]! : "";
}
