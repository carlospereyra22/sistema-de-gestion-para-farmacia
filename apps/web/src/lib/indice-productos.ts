// Búsquedas en el catálogo sin recorrerlo entero (SISTEMA-74). Con decenas de
// miles de productos, `products.find((p) => p.id === id)` dentro de un listado
// (cada renglón, cada compra, cada precio) multiplica el trabajo y traba la
// pantalla. El índice se arma una vez por lista y se reutiliza mientras la
// lista sea la misma (el catálogo por partes devuelve la misma lista si no
// cambió nada).

type ConId = { id: string };

const porId = new WeakMap<readonly ConId[], Map<string, ConId>>();

/** El producto (o cualquier fila con `id`) de la lista, sin recorrerla. */
export function productoPorId<T extends ConId>(
  lista: readonly T[],
  id: string | null | undefined,
): T | undefined {
  if (!id) return undefined;
  let indice = porId.get(lista);
  if (!indice) {
    indice = new Map(lista.map((fila) => [fila.id, fila]));
    porId.set(lista, indice);
  }
  return indice.get(id) as T | undefined;
}

type ConCodigos = {
  id: string;
  barcodes: readonly { code: string }[];
};

const porCodigo = new WeakMap<readonly ConCodigos[], Map<string, ConCodigos>>();

/** El primer producto de la lista con ese código de barras exacto. */
export function productoPorCodigo<T extends ConCodigos>(
  lista: readonly T[],
  codigo: string,
): T | undefined {
  let indice = porCodigo.get(lista);
  if (!indice) {
    indice = new Map();
    for (const producto of lista)
      for (const { code } of producto.barcodes)
        if (!indice.has(code)) indice.set(code, producto);
    porCodigo.set(lista, indice);
  }
  return indice.get(codigo.trim()) as T | undefined;
}

type Buscable = { name: string; barcodes: readonly { code: string }[] };

const textos = new WeakMap<Buscable, string>();

/**
 * Texto de búsqueda del producto (nombre y códigos, en minúsculas), armado una
 * sola vez por producto en lugar de en cada tecla.
 */
export function textoDeBusqueda(producto: Buscable) {
  let texto = textos.get(producto);
  if (texto === undefined) {
    texto =
      `${producto.name} ${producto.barcodes.map((b) => b.code).join(" ")}`.toLocaleLowerCase(
        "es-AR",
      );
    textos.set(producto, texto);
  }
  return texto;
}

const lotesPorProducto = new WeakMap<
  readonly { productId: string }[],
  Map<string, { productId: string }[]>
>();

/** Lotes de un producto, sin recorrer todo el stock (SISTEMA-74). */
export function lotesDelProducto<T extends { productId: string }>(
  stock: readonly T[],
  productId: string,
): readonly T[] {
  let indice = lotesPorProducto.get(stock);
  if (!indice) {
    indice = new Map();
    for (const lote of stock) {
      const lista = indice.get(lote.productId);
      if (lista) lista.push(lote);
      else indice.set(lote.productId, [lote]);
    }
    lotesPorProducto.set(stock, indice);
  }
  return (indice.get(productId) ?? []) as T[];
}

/**
 * Texto en caché por objeto: se arma una vez por producto (y se rearma sólo
 * si el producto es otro objeto, porque cambió).
 */
export function textoEnCache<T extends object>(
  cache: WeakMap<T, string>,
  objeto: T,
  armar: (objeto: T) => string,
) {
  let texto = cache.get(objeto);
  if (texto === undefined) {
    texto = armar(objeto);
    cache.set(objeto, texto);
  }
  return texto;
}
