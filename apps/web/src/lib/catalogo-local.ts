import { almacenLocal } from "./almacen-local";
import type { CatalogProduct } from "./api";
import { SinConexionError } from "./api-fetch";

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

/** Partes por pedido, como acepta el servidor. */
export const PARTES_POR_PEDIDO = 32;

type Indice = {
  version: 1;
  partes: Record<string, string>;
  diccionario?: Diccionario;
};

type EnMemoria = {
  indice: Indice;
  partes: Map<string, ProductoDeParte[]>;
  /** Catálogo armado: se reutiliza mientras no cambie nada. */
  armado?: CatalogProduct[];
};

const enMemoria = new Map<string, EnMemoria>();
const enCurso = new Map<string, Promise<CatalogProduct[]>>();

/** Las claves van bajo el usuario: se borran con el resto de su copia. */
const prefijo = (alcance: string, org: string, branchId?: string) =>
  `${alcance}|catalogo|${org}|${branchId ?? "organizacion"}|`;

const parteDe = (id: string) => id.slice(0, 2).toLowerCase();

/** Almacén del que salió lo que está en memoria: si cambia, se vuelve a leer. */
let almacenDeLaMemoria: unknown;

async function cargar(base: string): Promise<EnMemoria> {
  if (almacenDeLaMemoria !== almacenLocal()) {
    enMemoria.clear();
    almacenDeLaMemoria = almacenLocal();
  }
  const guardado = enMemoria.get(base);
  if (guardado) return guardado;
  const almacen = almacenLocal();
  const indice = (await almacen.leer<Indice>(`${base}indice`)) ?? {
    version: 1,
    partes: {},
  };
  const partes = new Map<string, ProductoDeParte[]>();
  for (const parte of Object.keys(indice.partes)) {
    const productos = await almacen.leer<ProductoDeParte[]>(
      `${base}p|${parte}`,
    );
    // Una parte que falta se vuelve a pedir: se la saca del índice.
    if (productos) partes.set(parte, productos);
    else delete indice.partes[parte];
  }
  const entrada = { indice, partes };
  enMemoria.set(base, entrada);
  return entrada;
}

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

function armado(entrada: EnMemoria) {
  entrada.armado ??= armarCatalogo(
    entrada.partes.values(),
    entrada.indice.diccionario,
  );
  return entrada.armado;
}

async function sincronizar(
  base: string,
  fuente: FuenteDelCatalogo,
): Promise<CatalogProduct[]> {
  const entrada = await cargar(base);
  const almacen = almacenLocal();
  let versiones: VersionesDelCatalogo;
  try {
    versiones = await fuente.versiones(entrada.indice.diccionario?.version);
  } catch (error) {
    // Sin conexión: lo guardado en la PC, si hay.
    if (error instanceof SinConexionError && entrada.partes.size)
      return armado(entrada);
    throw error;
  }
  const guardarIndice = () =>
    almacen.guardar(`${base}indice`, entrada.indice).catch(() => {});
  const { categorias, laboratorios } = versiones.diccionario;
  if (categorias && laboratorios) {
    entrada.indice.diccionario = {
      version: versiones.diccionario.version,
      categorias,
      laboratorios,
    };
    entrada.armado = undefined;
    await guardarIndice();
  }
  const cambiadas = Object.keys(versiones.partes).filter(
    (parte) =>
      entrada.indice.partes[parte] !== versiones.partes[parte] ||
      !entrada.partes.has(parte),
  );
  const quitadas = Object.keys(entrada.indice.partes).filter(
    (parte) => !(parte in versiones.partes),
  );
  for (const parte of quitadas) {
    delete entrada.indice.partes[parte];
    entrada.partes.delete(parte);
    await almacen.borrar(`${base}p|${parte}`).catch(() => {});
  }
  if (quitadas.length) {
    entrada.armado = undefined;
    await guardarIndice();
  }
  for (let i = 0; i < cambiadas.length; i += PARTES_POR_PEDIDO) {
    const tanda = cambiadas.slice(i, i + PARTES_POR_PEDIDO);
    let respuesta: PartesDelCatalogo;
    try {
      respuesta = await fuente.partes(tanda);
    } catch (error) {
      // Se cortó en el medio: queda lo que ya se actualizó.
      if (error instanceof SinConexionError && entrada.partes.size) break;
      throw error;
    }
    const porParte = new Map<string, ProductoDeParte[]>(
      tanda.map((parte) => [parte, []]),
    );
    for (const producto of respuesta.productos)
      porParte.get(parteDe(producto.id))?.push(producto);
    for (const [parte, productos] of porParte) {
      const version = respuesta.versiones[parte];
      if (!version) {
        delete entrada.indice.partes[parte];
        entrada.partes.delete(parte);
        await almacen.borrar(`${base}p|${parte}`).catch(() => {});
        continue;
      }
      entrada.partes.set(parte, productos);
      entrada.indice.partes[parte] = version;
      await almacen.guardar(`${base}p|${parte}`, productos).catch(() => {});
    }
    entrada.armado = undefined;
    // Se guarda el índice después de cada tanda: un corte no pierde lo bajado.
    await guardarIndice();
  }
  return armado(entrada);
}

/**
 * Catálogo al día, bajando sólo lo que cambió. Si hay una actualización en
 * curso para el mismo catálogo, espera esa en lugar de pedir todo otra vez.
 * Mientras nada cambie devuelve la misma lista (la pantalla no se redibuja).
 */
export function catalogoAlDia(
  alcance: string,
  organizationId: string,
  branchId: string | undefined,
  fuente: FuenteDelCatalogo,
): Promise<CatalogProduct[]> {
  const base = prefijo(alcance, organizationId, branchId);
  const previa = enCurso.get(base);
  if (previa) return previa;
  const promesa = sincronizar(base, fuente).finally(() => {
    enCurso.delete(base);
  });
  enCurso.set(base, promesa);
  return promesa;
}

/** Olvida lo que está en memoria (al cerrar sesión y en los tests). */
export function olvidarCatalogoEnMemoria() {
  enMemoria.clear();
  enCurso.clear();
}
