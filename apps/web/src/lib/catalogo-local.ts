import type { CatalogProduct } from "./api";
import { copiaAlDia, olvidarCopiasEnMemoria } from "./copia-por-partes";

// Catálogo por partes en la PC (SISTEMA-74). El servidor divide el catálogo en
// 256 partes, cada una con una versión que resume su contenido. La PC guarda
// cada parte en IndexedDB y, al actualizar, pide sólo las versiones (unos KB)
// y vuelve a bajar únicamente las partes que cambiaron. Con 60.000 productos el
// catálogo entero pesa ~46 MB; editar un producto baja ~200 KB.
//
// También es la copia sin conexión del catálogo: sin internet se arma con las
// partes guardadas.

/** Producto de una parte: categoría y laboratorio van por id. */
export type ProductoDeParte = Omit<
  CatalogProduct,
  "category" | "laboratory"
> & {
  categoryId: string | null;
  laboratoryId: string | null;
};

type Categoria = { id: string; name: string; path: string };
type Laboratorio = { id: string; name: string };

export type Diccionario = {
  version: string;
  categorias: Categoria[];
  laboratorios: Laboratorio[];
};

export type VersionesDelCatalogo = {
  partes: Record<string, string>;
  diccionario: { version: string } & Partial<Omit<Diccionario, "version">>;
};

export type PartesDelCatalogo = {
  versiones: Record<string, string | null>;
  productos: ProductoDeParte[];
};

/** De dónde salen las versiones y las partes (la API; en los tests, un doble). */
export type FuenteDelCatalogo = {
  versiones(diccionario?: string): Promise<VersionesDelCatalogo>;
  partes(partes: string[]): Promise<PartesDelCatalogo>;
};

/** Las claves van bajo el usuario: se borran con el resto de su copia. */
const prefijo = (alcance: string, org: string, branchId?: string) =>
  `${alcance}|catalogo|${org}|${branchId ?? "organizacion"}|`;

const parteDe = (id: string) => id.slice(0, 2).toLowerCase();

/** Arma el catálogo como lo devuelve el listado completo, ordenado por nombre. */
export function armarCatalogo(
  partes: Iterable<ProductoDeParte[]>,
  diccionario?: Pick<Diccionario, "categorias" | "laboratorios">,
): CatalogProduct[] {
  const categorias = new Map(
    (diccionario?.categorias ?? []).map((c) => [c.id, c]),
  );
  const laboratorios = new Map(
    (diccionario?.laboratorios ?? []).map((l) => [l.id, l]),
  );
  const productos: CatalogProduct[] = [];
  for (const parte of partes)
    for (const { categoryId, laboratoryId, ...producto } of parte)
      productos.push({
        ...producto,
        category: (categoryId && categorias.get(categoryId)) || null,
        laboratory: (laboratoryId && laboratorios.get(laboratoryId)) || null,
      });
  return productos.sort(
    (a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id),
  );
}

/**
 * Catálogo al día, bajando sólo lo que cambió (`copia-por-partes.ts`). Si hay
 * una actualización en curso para el mismo catálogo, espera esa. Mientras nada
 * cambie devuelve la misma lista (la pantalla no se redibuja).
 */
export function catalogoAlDia(
  alcance: string,
  organizationId: string,
  branchId: string | undefined,
  fuente: FuenteDelCatalogo,
): Promise<CatalogProduct[]> {
  return copiaAlDia<ProductoDeParte, Diccionario, CatalogProduct[]>({
    base: prefijo(alcance, organizationId, branchId),
    versiones: async (guardado) => {
      const versiones = await fuente.versiones(guardado?.version);
      const { categorias, laboratorios, version } = versiones.diccionario;
      return {
        partes: versiones.partes,
        extra:
          categorias && laboratorios
            ? { version, categorias, laboratorios }
            : undefined,
      };
    },
    partes: async (partes) => {
      const respuesta = await fuente.partes(partes);
      return { versiones: respuesta.versiones, elementos: respuesta.productos };
    },
    parteDe: (producto) => parteDe(producto.id),
    armar: (partes, diccionario) => armarCatalogo(partes, diccionario),
  });
}

/** Olvida lo que está en memoria (al cerrar sesión y en los tests). */
export function olvidarCatalogoEnMemoria() {
  olvidarCopiasEnMemoria();
}
