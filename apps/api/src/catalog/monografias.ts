// Fichas de cada marca publicadas en PR Vademécum Argentina (SISTEMA-123):
// reglas puras para vincularlas con la base y leer su composición. Ver
// docs/MEDICINE_CATALOG.md. Ante cualquier duda, nada: es mejor no mostrar una
// ficha que mostrar la de otro producto.

import { dosisParaPresentacion } from "./dosis-marcas";

export type Monografia = {
  sourceId: number;
  name: string;
  laboratory: string;
  therapeuticAction: string;
  composition: string;
  indications: string;
  dosage: string;
  presentations: string;
  sourceUrl: string;
};

function normalizado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombre comparable: sin tildes, signos ni espacios ("V.L." = "VL"). */
export function claveNombre(nombre: string): string {
  return normalizado(nombre).replace(/[^a-z0-9]+/g, "");
}

// Palabras de razón social que no distinguen laboratorios.
const GENERICAS = new Set([
  "laboratorio",
  "laboratorios",
  "lab",
  "labs",
  "sa",
  "saic",
  "saci",
  "srl",
  "arg",
  "argentina",
  "consumer",
  "health",
  "healthcare",
  "farma",
  "pharma",
  "de",
  "y",
  "the",
]);

function palabrasLaboratorio(nombre: string): Set<string> {
  return new Set(
    normalizado(nombre)
      .split(/[^a-z0-9]+/)
      .filter((palabra) => palabra.length > 2 && !GENERICAS.has(palabra)),
  );
}

/** Mismo laboratorio si comparten una palabra propia ("Haleon Argentina" / "HALEON ARG"). */
export function mismoLaboratorio(a: string, b: string): boolean {
  const pa = palabrasLaboratorio(a);
  return [...palabrasLaboratorio(b)].some((palabra) => pa.has(palabra));
}

/**
 * La ficha de un medicamento de la base: mismo nombre exacto. Si hay varias
 * con ese nombre, la del mismo laboratorio, y sólo si es una.
 */
export function elegirMonografia<
  T extends Pick<Monografia, "name" | "laboratory">,
>(
  item: { name: string; laboratory: string },
  porNombre: Map<string, T[]>,
): T | null {
  const candidatas = porNombre.get(claveNombre(item.name)) ?? [];
  if (!candidatas.length) return null;
  const delLaboratorio = candidatas.filter((ficha) =>
    mismoLaboratorio(ficha.laboratory, item.laboratory),
  );
  if (delLaboratorio.length === 1) return delLaboratorio[0]!;
  // Un solo producto con ese nombre y laboratorio sin dato: se acepta.
  if (candidatas.length === 1 && !item.laboratory.trim()) return candidatas[0]!;
  return null;
}

// Formas de uso externo: la concentración va por cada 100 g o ml.
const TOPICA =
  /\b(cr|crema|gel|pom|pomo|pomada|ung|unguento|loc|locion|emuls|sol\.? ?top|topica|spray|aerosol|espuma|pasta|polvo|pvo|shamp|champu)\b/;
// La forma del padrón: "Cremas/Geles/Pomadas/Ungüentos", "Solución de uso externo".
const FORMA_TOPICA = /crema|pomada|unguento|uso externo|locion|emulsion|spray/;
const CADA_100 = /cada\s+100\s*(g|gr|ml)\b/;

/**
 * Concentración de una presentación de uso externo ("cada 100 g contiene:
 * Diclofenac 1.16 g" → "1.16 g/100 g"). Sólo una droga y una sola parte de la
 * composición que hable "cada 100 g/ml".
 */
export function concentracionTopica(
  composicion: string,
  componentes: number,
  presentacion: string,
  forma = "",
): string | null {
  const topica =
    TOPICA.test(normalizado(presentacion)) ||
    FORMA_TOPICA.test(normalizado(forma));
  if (componentes !== 1 || !topica) return null;
  const texto = normalizado(composicion);
  const partes = texto.split(/(?=\b[a-z][a-z ()]{2,40}:\s*cada\b)/);
  const conCien = partes.filter((parte) => CADA_100.test(parte));
  if (conCien.length !== 1) return null;
  const parte = conCien[0]!;
  const base = CADA_100.exec(parte)![1] === "ml" ? "ml" : "g";
  const principal = (parte.split(/excipientes?|c\.s\.p?|csp/)[0] ?? "").replace(
    CADA_100,
    "",
  );
  const valores = [
    ...principal.matchAll(/(\d+(?:[.,]\d+)?)\s*(mg|g)(?![a-z])/g),
  ];
  if (valores.length < 1) return null;
  // La primera cantidad es la de la droga; un "equivalente a" posterior no cuenta.
  const [, numero = "", unidad = ""] = valores[0]!;
  const gramos =
    Number(numero.replace(",", ".")) / (unidad === "mg" ? 1000 : 1);
  if (!Number.isFinite(gramos) || gramos <= 0 || gramos >= 100) return null;
  return `${Number(gramos.toFixed(4))} g/100 ${base}`;
}

/** Dosis de una presentación según la ficha: por unidad, por ml o por 100 g. */
export function dosisDeFicha(
  composicion: string,
  componentes: number,
  presentacion: string,
  forma = "",
): string | null {
  return (
    dosisParaPresentacion(composicion, componentes, presentacion) ??
    concentracionTopica(composicion, componentes, presentacion, forma)
  );
}

// Vía según el modo de uso de la ficha, cuando lo dice sin dudas.
const VIAS: [RegExp, string][] = [
  [
    /\b(oftalmic[ao]|en el saco conjuntival|en (el|los) ojos?|gotas? en cada ojo)\b/,
    "oftálmica",
  ],
  [/\b(nasal|fosas? nasal|en cada fosa)\b/, "nasal"],
  [/\b(vaginal|intravaginal|en la vagina)\b/, "vaginal"],
  [/\b(rectal|via rectal)\b/, "rectal"],
  [/\b(transdermic[ao]|parche)\b/, "transdérmica"],
  [/\b(inhalatori[ao]|inhalar|inhalacion)\b/, "inhalatoria"],
  [
    /\b(topic[ao]|uso externo|cutane[ao]|sobre la piel|zona afectada|aplicar|aplique)\b/,
    "uso externo",
  ],
  [
    /\b(via oral|oral|ingerir|tragar|masticar|disolver en (la boca|agua)|comprimidos?|capsulas?)\b/,
    "oral",
  ],
];

export function viaDeFicha(modoDeUso: string): string | null {
  const texto = normalizado(modoDeUso);
  const halladas = VIAS.filter(([regla]) => regla.test(texto)).map(
    ([, via]) => via,
  );
  // "Aplicar" acompaña a casi todas las vías locales: si hay una más precisa, esa.
  const precisas = halladas.filter(
    (via) => via !== "uso externo" && via !== "oral",
  );
  if (precisas.length === 1) return precisas[0]!;
  if (precisas.length > 1) return null;
  const unicas = [...new Set(halladas)];
  return unicas.length === 1 ? unicas[0]! : null;
}
