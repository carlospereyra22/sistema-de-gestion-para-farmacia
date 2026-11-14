/**
 * Tope de conexiones a PostgreSQL por proceso (SISTEMA-106). Con varias copias
 * de la API y el worker sobre la misma base, cada proceso declara su tope con
 * DATABASE_CONNECTION_LIMIT para que la suma no supere `max_connections`.
 * Sin la variable, la URL queda igual y Prisma usa su valor por defecto
 * (núcleos × 2 + 1). Un `connection_limit` ya escrito en la URL se respeta.
 */
export function urlConLimiteDeConexiones(
  url: string | undefined,
  limite: string | undefined,
  esperaSegundos: string | undefined,
): string | undefined {
  if (!url) return url;
  const destino = new URL(url);
  agregar(destino, "connection_limit", limite, 1, 200);
  agregar(destino, "pool_timeout", esperaSegundos, 1, 120);
  return destino.toString();
}

function agregar(
  destino: URL,
  parametro: string,
  valor: string | undefined,
  minimo: number,
  maximo: number,
): void {
  if (valor === undefined || valor === "") return;
  if (destino.searchParams.has(parametro)) return;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo)
    throw new Error(
      `${parametro}: se esperaba un entero entre ${minimo} y ${maximo}.`,
    );
  destino.searchParams.set(parametro, String(numero));
}
