/**
 * Números que muestra el paginador: siempre la primera, la última y las vecinas
 * de la actual; los saltos van como "…". Ej.: 1 … 4 5 6 … 12.
 */
export function paginasVisibles(
  actual: number,
  total: number,
  vecinas = 1,
): (number | "…")[] {
  if (total <= 1) return [1];
  const numeros = new Set<number>([1, total]);
  for (let p = actual - vecinas; p <= actual + vecinas; p++)
    if (p >= 1 && p <= total) numeros.add(p);
  const ordenados = [...numeros].sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  for (const [i, p] of ordenados.entries()) {
    const anterior = ordenados[i - 1];
    if (anterior !== undefined && p - anterior === 2) salida.push(anterior + 1);
    else if (anterior !== undefined && p - anterior > 2) salida.push("…");
    salida.push(p);
  }
  return salida;
}

export const totalDePaginas = (productos: number, porPagina: number) =>
  Math.max(1, Math.ceil(productos / porPagina));
