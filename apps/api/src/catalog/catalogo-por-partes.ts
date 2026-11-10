import { createHash } from "node:crypto";

// Catálogo por partes (SISTEMA-74). Con decenas de miles de productos, bajar el
// catálogo entero en cada actualización pesa decenas de MB. Se lo divide en 256
// partes según los dos primeros caracteres del id (UUID al azar, así quedan
// parejas). Cada parte tiene una versión que resume su contenido: la PC guarda
// las partes y sólo vuelve a pedir las que cambiaron.

/** Una parte: dos caracteres hexadecimales ("00" a "ff"). */
export const PARTE = /^[0-9a-f]{2}$/;

/** Partes por pedido: unos cientos de productos cada una. */
export const PARTES_POR_PEDIDO = 32;

export const parteDe = (id: string) => id.slice(0, 2).toLowerCase();

/** Rango de ids de una parte, para filtrar con el índice de la clave. */
export function rangoDeParte(parte: string) {
  if (!PARTE.test(parte)) throw new Error(`Parte inválida: ${parte}`);
  return {
    gte: `${parte}000000-0000-0000-0000-000000000000`,
    lte: `${parte}ffffff-ffff-ffff-ffff-ffffffffffff`,
  };
}

/** Lee la lista de partes pedida ("0a,1f,..."): sin repetidos y válidas. */
export function partesPedidas(texto: string) {
  const partes = [...new Set(texto.split(",").map((p) => p.trim()))].filter(
    Boolean,
  );
  if (!partes.length || partes.length > PARTES_POR_PEDIDO)
    throw new Error(`Pedí entre 1 y ${PARTES_POR_PEDIDO} partes.`);
  if (partes.some((p) => !PARTE.test(p)))
    throw new Error("Hay una parte inválida.");
  return partes;
}

/** Huella de una parte en cada tabla: `parte` y un md5 de su contenido. */
export type HuellaDeTabla = { parte: string; huella: string };

/**
 * Versión de cada parte con productos: combina la huella de productos,
 * códigos, precio general, estado en la sucursal y foto. Cualquier cambio en
 * esas tablas cambia la versión. `contexto` lleva lo que afecta a todas (la
 * lista de precio general vigente).
 */
export function versionesDePartes(
  tablas: {
    productos: HuellaDeTabla[];
    codigos: HuellaDeTabla[];
    precios: HuellaDeTabla[];
    estados: HuellaDeTabla[];
    fotos: HuellaDeTabla[];
  },
  contexto: string,
): Record<string, string> {
  const mapa = (filas: HuellaDeTabla[]) =>
    new Map(filas.map((f) => [f.parte, f.huella]));
  const codigos = mapa(tablas.codigos),
    precios = mapa(tablas.precios),
    estados = mapa(tablas.estados),
    fotos = mapa(tablas.fotos);
  const versiones: Record<string, string> = {};
  for (const { parte, huella } of tablas.productos)
    versiones[parte] = createHash("sha1")
      .update(
        [
          contexto,
          huella,
          codigos.get(parte) ?? "-",
          precios.get(parte) ?? "-",
          estados.get(parte) ?? "-",
          fotos.get(parte) ?? "-",
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 20);
  return versiones;
}

/** Versión de un diccionario (categorías o laboratorios). */
export const versionDe = (valor: unknown) =>
  createHash("sha1").update(JSON.stringify(valor)).digest("hex").slice(0, 20);
