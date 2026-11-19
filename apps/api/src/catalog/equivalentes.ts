// Equivalentes de un medicamento (SISTEMA-108): reglas puras. Ver
// docs/PRODUCTS.md.

export type ItemBase = {
  // Dosis de la marca cuando el padrón no la escribe (de la composición).
  doseText?: string;
  id: string;
  name: string;
  presentation: string;
  laboratory: string;
  pharmaceuticalForm: string;
  priceMinor: bigint;
  codigos: string[];
};

export type ProductoPropio = {
  id: string;
  nombre: string;
  precioMinor: bigint | null;
  stock: number;
};

export type Alternativa = {
  itemId: string;
  nombre: string;
  presentacion: string;
  laboratorio: string;
  forma: string;
  concentracion: string;
  // false: hay algo que confirmar antes de cambiar (ver `aviso`).
  dosisConfirmada: boolean;
  aviso: string | null;
  unidades: number | null;
  precioMinor: string;
  precioPorUnidadMinor: string | null;
  producto:
    | (Omit<ProductoPropio, "precioMinor"> & { precioMinor: string | null })
    | null;
};

// Dosis de una presentación. Puede tener varios componentes ("320/25 mg",
// "875/125 mg"), se compara componente por componente. Sin unidad cuando sale
// de un número suelto del nombre ("SINDOL 600", "AMLODICORD 5").
// `comparable` la lleva a mg o mg/ml para que "1 g" = "1000 mg" y
// "2%" = "100 mg/5 ml".
export type Dosis = {
  valores: number[];
  unidad: string;
  comparable: { valores: number[]; unidad: string };
} | null;

const MASA: Record<string, number> = {
  mg: 1,
  g: 1000,
  mcg: 0.001,
  ug: 0.001,
  µg: 0.001,
};

function aComparable(valores: number[], unidad: string) {
  const factor = MASA[unidad];
  if (factor) return { valores: valores.map((v) => v * factor), unidad: "mg" };
  // Porcentaje peso/volumen: 2% = 20 mg/ml.
  if (unidad === "%" || unidad === "g%")
    return { valores: valores.map((v) => v * 10), unidad: "mg/ml" };
  // Por volumen o por peso ("100 mg/5 ml", "5 g/100 g"): mg por ml o g.
  const porVolumen = /^(mg|g|mcg|ug)\/(\d+(?:\.\d+)?)?(?:ml|g)$/.exec(unidad);
  if (porVolumen?.[1]) {
    const masa = MASA[porVolumen[1]] ?? 1;
    const volumen = Number(porVolumen[2] ?? "1") || 1;
    return {
      valores: valores.map((v) => (v * masa) / volumen),
      unidad: "mg/ml",
    };
  }
  return { valores, unidad };
}

function dosis(valores: number[], unidad: string): NonNullable<Dosis> {
  return { valores, unidad, comparable: aComparable(valores, unidad) };
}

function iguales(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(a, b) * 0.005;
}

function mismosValores(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => iguales(v, b[i] ?? NaN));
}

function normalizado(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");
}

const numero = (texto: string) => Number(texto.replace(",", "."));

// Dosis escrita con unidad, en la presentación o en el nombre. Ignora lo que
// sigue a una "x" (tamaño del envase: "x 250 g", "x 20").
function dosisEscrita(texto: string): Dosis {
  const patron =
    /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*)\s*(mcg|ug|µg|mg|g%|g(?![a-z])|ui(?![a-z])|u\.i\.|%)(\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(ml|g)(?![a-z]))?/g;
  for (const coincidencia of texto.matchAll(patron)) {
    const antes = texto.slice(0, coincidencia.index);
    if (/x\s*$/.test(antes)) continue;
    const valores = (coincidencia[1] ?? "")
      .split("/")
      .map((parte) => numero(parte.trim()));
    if (!valores.length || valores.some((v) => !Number.isFinite(v) || v <= 0))
      continue;
    let unidad = (coincidencia[2] ?? "").replace("u.i.", "ui");
    if (coincidencia[3])
      unidad = `${unidad}/${coincidencia[4] ? numero(coincidencia[4]) : ""}${coincidencia[5]}`;
    return dosis(valores, unidad);
  }
  return null;
}

export function dosisDe(nombre: string, presentacion: string): Dosis {
  const escrita =
    dosisEscrita(normalizado(presentacion)) ??
    dosisEscrita(normalizado(nombre));
  if (escrita) return escrita;
  // Número sin unidad al principio de la presentación: "500 comp.x 10".
  const inicial =
    /^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*)\s*(?!ml|l\b|cc|x)(?=[a-z])/.exec(
      normalizado(presentacion).trim(),
    );
  if (inicial?.[1]) return dosis(inicial[1].split("/").map(numero), "");
  // Número suelto del nombre: "ACTRON 400 x20", "IBU 600", "AMLODICORD 5",
  // "SARVAL D 160/25". No el tamaño del envase ("x20", "4 x 4").
  const tokens = normalizado(nombre).split(/\s+/);
  for (const [indice, token] of tokens.entries()) {
    if (tokens[indice - 1] === "x" || tokens[indice + 1] === "x") continue;
    const suelto =
      /^(\d{1,6}(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*)(?:x\d+)?$/.exec(token);
    if (suelto?.[1]) return dosis(suelto[1].split("/").map(numero), "");
  }
  return null;
}

// La dosis de un medicamento de la base: la escrita y, si el padrón no la
// tiene, la de la marca guardada aparte (`doseText`).
export function dosisDeItem(item: {
  name: string;
  presentation: string;
  doseText?: string;
}): Dosis {
  return (
    dosisDe(item.name, item.presentation) ??
    (item.doseText ? dosisDe(item.name, item.doseText) : null)
  );
}

// `sinDatoIgual`: dos presentaciones sin dosis escrita se consideran iguales
// solo si en esa forma la droga casi nunca la escribe (dipirona en
// comprimidos); si no, quedan para confirmar.
export function compararDosis(
  a: Dosis,
  b: Dosis,
  sinDatoIgual = true,
): "igual" | "distinta" | "sin dato" {
  if (!a && !b) return sinDatoIgual ? "igual" : "sin dato";
  if (!a || !b) return "sin dato";
  if (a.unidad && b.unidad)
    return a.comparable.unidad === b.comparable.unidad &&
      mismosValores(a.comparable.valores, b.comparable.valores)
      ? "igual"
      : "distinta";
  // Una sin unidad (número del nombre): alcanza con los mismos números, o
  // los mismos en mg ("1 g" ↔ "IBU 1000").
  return mismosValores(a.valores, b.valores) ||
    (a.comparable.unidad === "mg" &&
      mismosValores(a.comparable.valores, b.valores)) ||
    (b.comparable.unidad === "mg" &&
      mismosValores(b.comparable.valores, a.valores))
    ? "igual"
    : "distinta";
}

// Si al elegido le falta la dosis, la de otras presentaciones con el mismo
// nombre, cuando todas dicen lo mismo ("AMIXEN DUO comp.x 14" ↔ "AMIXEN DUO
// 875 mg comp.x 16").
export function dosisPorNombre(
  nombre: string,
  items: Pick<
    ItemBase,
    "name" | "presentation" | "pharmaceuticalForm" | "doseText"
  >[],
  forma: string,
): Dosis {
  const clave = normalizado(nombre).replace(/\s+/g, " ").trim();
  const mismaForma = normalizado(forma.trim());
  let encontrada: Dosis = null;
  for (const item of items) {
    if (normalizado(item.name).replace(/\s+/g, " ").trim() !== clave) continue;
    // Solo la misma forma: el jarabe no tiene la dosis del comprimido.
    if (!mismaForma || formaDe(item) !== mismaForma) continue;
    const propia = dosisDeItem(item);
    if (!propia) continue;
    if (encontrada && compararDosis(encontrada, propia) !== "igual")
      return null;
    encontrada ??= propia;
  }
  return encontrada;
}

// Palabras del nombre que indican otra potencia o público: entre dos
// presentaciones sin dosis escrita, "OXAGESIC FORTE" no equivale a
// "DIOXAFLEX GESIC".
const MODIFICADORES = new Set([
  "forte",
  "plus",
  "duo",
  "max",
  "maximo",
  "extra",
  "ultra",
  "mini",
  "ped",
  "ped.",
  "pediatrico",
  "infantil",
  "junior",
  "kids",
  "ninos",
  "bebe",
  "adulto",
  "adultos",
]);

function modificadoresDe(nombre: string): string {
  return (
    normalizado(nombre)
      .split(/[\s.]+/)
      // También proporciones como "14:1" (amoxicilina/clavulánico).
      .filter(
        (palabra) => MODIFICADORES.has(palabra) || /^\d+:\d+$/.test(palabra),
      )
      .sort()
      .join(" ")
  );
}

function textoDosis(valor: Dosis): string {
  if (!valor) return "";
  return `${valor.valores.join("/")}${valor.unidad ? ` ${valor.unidad}` : ""}`;
}

// Forma del padrón deducida de la abreviatura de la presentación, para
// productos cargados sin forma ("cáps.gelat.blanda x 20" → cápsulas).
export function formaDePresentacion(presentacion: string): string {
  const texto = normalizado(presentacion);
  const reglas: [RegExp, string][] = [
    [
      /lib\.?\s*(prol|contr|mod|ret)|retard|\bxr\b|\bap\b/,
      "Cáps./Comp. de Liberación Controlada",
    ],
    [/\bov\.|ovulo|vag/, "Ovulos/Comprimidos vaginales"],
    [/caps/, "Cápsulas/Softgels"],
    [/comp|grag|tab|\bcpr/, "Comprimidos/Pastillas/Tabletas/Grageas"],
    [/oft|colirio/, "Gotas oftálmicas/Colirios"],
    [/\bgts|gotas|\bgot\./, "Gotas orales"],
    [
      /jbe|jar|susp|elix|pvo|polvo/,
      "Jarabe/Suspensión oral/Polvo para uso oral",
    ],
    [
      /\ba\.|amp|f\.a|iny|vial/,
      "Ampollas/Frascos-Ampolla/Liofilizados/Soluc.Parent",
    ],
    [/\bcr\.|crema|gel|ung|\bpda|pomada/, "Cremas/Geles/Pomadas/Ungüentos"],
    [/supos/, "Supositorios"],
    [/parch/, "Parches transdermicos"],
    [/\bsob|gran/, "Granulados"],
  ];
  return reglas.find(([regla]) => regla.test(texto))?.[1] ?? "";
}

function formaDe(item: Pick<ItemBase, "pharmaceuticalForm" | "presentation">) {
  return normalizado(
    item.pharmaceuticalForm.trim() || formaDePresentacion(item.presentation),
  );
}

// "500 mg" y "500mg" son la misma concentración.
export function claveConcentracion(texto: string): string {
  return texto.toLocaleLowerCase("es-AR").replace(/\s+/g, "").replace(",", ".");
}

// Unidades contables del envase: "comp.x 20" → 20; "sob.x 15 x 2" → 30.
// Volúmenes o pesos ("jbe.x 120 ml") no se cuentan por unidad.
export function unidadesDe(presentacion: string): number | null {
  const texto = presentacion.toLocaleLowerCase("es-AR");
  const partes = [
    ...texto.matchAll(
      /x\s*(\d+(?:[.,]\d+)?)(\s*(?:ml|l|g|mg|mcg|kg|cc|ds|dosis)(?![a-z]))?/g,
    ),
  ];
  // Los volúmenes de cada unidad no cuentan ("a.x 25 x 2 ml" → 25
  // ampollas); si solo hay volumen ("jbe.x 120 ml"), no se cuenta.
  const cantidades = partes.filter(([, , volumen]) => !volumen);
  if (!cantidades.length) return null;
  let total = 1;
  for (const [, numero] of cantidades) {
    const valor = Number((numero ?? "").replace(",", "."));
    if (!Number.isInteger(valor) || valor <= 0) return null;
    total *= valor;
  }
  return total > 0 && total < 10_000 ? total : null;
}

function alternativa(
  item: ItemBase,
  producto: ProductoPropio | undefined,
  aviso: string | null,
): Alternativa {
  const unidades = unidadesDe(item.presentation);
  const precio = producto?.precioMinor ?? item.priceMinor;
  return {
    itemId: item.id,
    nombre: item.name,
    presentacion: item.presentation,
    laboratorio: item.laboratory,
    forma: item.pharmaceuticalForm,
    concentracion: textoDosis(dosisDeItem(item)),
    dosisConfirmada: !aviso,
    aviso,
    unidades,
    precioMinor: item.priceMinor.toString(),
    precioPorUnidadMinor: unidades
      ? ((precio + BigInt(unidades) / 2n) / BigInt(unidades)).toString()
      : null,
    producto: producto
      ? {
          ...producto,
          precioMinor: producto.precioMinor?.toString() ?? null,
        }
      : null,
  };
}

export const AVISO_DOSIS = "Dosis no informada: confirmá la concentración.";

// Como Previta: primero las de dosis confirmada y, dentro, por precio por
// unidad (o del envase si no se puede contar).
function orden(a: Alternativa, b: Alternativa): number {
  const confirmada = Number(b.dosisConfirmada) - Number(a.dosisConfirmada);
  if (confirmada) return confirmada;
  const precio = (x: Alternativa) =>
    BigInt(x.precioPorUnidadMinor ?? x.producto?.precioMinor ?? x.precioMinor);
  const diferencia = precio(a) - precio(b);
  return diferencia < 0n ? -1 : diferencia > 0n ? 1 : 0;
}

// Equivalentes: misma forma y misma dosis. Si a uno le falta la dosis
// escrita, entra igual pero marcado para confirmar. El resto, misma droga.
export function separarAlternativas(
  base: {
    forma: string;
    dosis: Dosis;
    itemIds: Set<string>;
    codigos: Set<string>;
    nombre?: string;
    // Fórmula "+asoc." o multivitamínico: el padrón no detalla todos los
    // componentes, así que no se ofrecen equivalentes, solo relacionados.
    composicionAbierta?: boolean;
  },
  items: ItemBase[],
  productoPorCodigo: Map<string, ProductoPropio>,
): { equivalentes: Alternativa[]; mismaDroga: Alternativa[] } {
  const equivalentes: Alternativa[] = [];
  const mismaDroga: Alternativa[] = [];
  const forma = normalizado(base.forma.trim());
  // Sin dosis del elegido: si en esa forma casi nadie la escribe (dipirona en
  // comprimidos), una dosis escrita marca otra concentración ("1 g"); si la
  // mayoría la escribe (ibuprofeno en cápsulas), queda para confirmar.
  const deLaForma = items.filter((item) => forma && formaDe(item) === forma);
  const conDosis = deLaForma.filter((item) => dosisDeItem(item)).length;
  const dosisHabitual = conDosis * 2 > deLaForma.length;
  const vistos = new Set<string>();
  const codigosVistos = new Set<string>();
  for (const item of items) {
    if (base.itemIds.has(item.id)) continue;
    if (item.codigos.some((codigo) => base.codigos.has(codigo))) continue;
    // Una sola fila por nombre y presentación, y por código: la misma caja
    // puede venir del padrón y de otra fuente con el texto apenas distinto.
    const clave = normalizado(`${item.name}|${item.presentation}`).replace(
      /[\s.]+/g,
      "",
    );
    if (
      vistos.has(clave) ||
      item.codigos.some((codigo) => codigosVistos.has(codigo))
    )
      continue;
    vistos.add(clave);
    for (const codigo of item.codigos) codigosVistos.add(codigo);
    const producto = item.codigos
      .map((codigo) => productoPorCodigo.get(codigo))
      .find(Boolean);
    const mismaForma = !!forma && formaDe(item) === forma;
    const dosisItem = dosisDeItem(item);
    let dosis =
      !base.dosis && dosisItem && !dosisHabitual
        ? "distinta"
        : compararDosis(base.dosis, dosisItem, !dosisHabitual);
    // Sin dosis escrita en ninguno, "FORTE", "PED." y similares marcan otra
    // potencia: no se dan por iguales.
    if (
      dosis === "igual" &&
      !base.dosis &&
      !dosisItem &&
      modificadoresDe(base.nombre ?? "") !== modificadoresDe(item.name)
    )
      dosis = "sin dato";
    if (mismaForma && dosis !== "distinta" && !base.composicionAbierta)
      equivalentes.push(
        alternativa(item, producto, dosis === "igual" ? null : AVISO_DOSIS),
      );
    else mismaDroga.push(alternativa(item, producto, null));
  }
  return {
    equivalentes: equivalentes.sort(orden),
    mismaDroga: mismaDroga.sort(orden),
  };
}
