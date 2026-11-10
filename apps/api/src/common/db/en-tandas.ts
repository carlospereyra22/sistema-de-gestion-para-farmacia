// Consultas con una lista grande de ids (SISTEMA-74). PostgreSQL admite como
// máximo 32.767 parámetros por consulta: con catálogos de decenas de miles de
// productos o lotes, un `id IN (...)` con todos falla. Se parte en tandas.

/** Ids por tanda: deja margen para los demás parámetros de la consulta. */
export const TAMANO_TANDA = 10000;

/** Corre la consulta por tandas de ids y junta los resultados, en orden. */
export async function enTandas<T>(
  ids: readonly string[],
  consulta: (tanda: string[]) => Promise<T[]>,
  tamano = TAMANO_TANDA,
): Promise<T[]> {
  const unicos = [...new Set(ids)];
  const resultado: T[] = [];
  for (let i = 0; i < unicos.length; i += tamano)
    resultado.push(...(await consulta(unicos.slice(i, i + tamano))));
  return resultado;
}
