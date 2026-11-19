// Formato de los archivos de dosis orientativas (SISTEMA-108).

export type DosisOrientativa = { uso: string; dosis: string };

// [principio activo del padrón, para qué sirve, cada cuánto]
export type FilaDosis = readonly [string, string, string];

export function tanda(filas: FilaDosis[]): Record<string, DosisOrientativa> {
  return Object.fromEntries(
    filas.map(([droga, uso, dosis]) => [droga, { uso, dosis }]),
  );
}

// Toda dosis lleva intervalo: "cada N h", "cada N días", "cada N min" o
// "dosis única".
export const INTERVALO =
  /cada \d+(?:[,.]\d+)?(?:-\d+)?(?: o \d+)? (?:h\b|días|min\b)|dosis única|infusión continua/i;
