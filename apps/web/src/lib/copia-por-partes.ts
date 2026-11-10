import { almacenLocal } from "./almacen-local";
import { SinConexionError } from "./api-fetch";

// Copia por partes en la PC (SISTEMA-74, generalizada en SISTEMA-77 para el
// stock). El servidor divide una lista grande en 256 partes (por los dos
// primeros caracteres de un id), cada una con una versión que resume su
// contenido. La PC guarda cada parte en IndexedDB y, al actualizar, pide sólo
// las versiones (unos KB) y vuelve a bajar únicamente las partes que
// cambiaron. También es la copia sin conexión: sin internet se arma con las
// partes guardadas.

/** Partes por pedido, como acepta el servidor. */
export const PARTES_POR_PEDIDO = 32;

export type Versiones<X> = {
  partes: Record<string, string>;
  /** Datos que valen para todas las partes (el diccionario del catálogo). */
  extra?: X;
};

export type Partes<T> = {
  versiones: Record<string, string | null>;
  elementos: T[];
};

/** Cómo se pide, se reparte y se arma una lista por partes. */
export type ListaPorPartes<T, X, R> = {
  /** Clave en el almacén, bajo el usuario: se borra con el resto de su copia. */
  base: string;
  versiones(extraGuardado: X | undefined): Promise<Versiones<X>>;
  partes(partes: string[]): Promise<Partes<T>>;
  parteDe(elemento: T): string;
  armar(partes: Iterable<T[]>, extra: X | undefined): R;
  /**
   * Si cambia, se vuelve a armar aunque no haya cambiado ninguna parte (el
   * stock depende del día: lotes que vencen).
   */
  vigencia?: () => string;
};

type Indice<X> = {
  version: 1;
  partes: Record<string, string>;
  extra?: X;
};

type EnMemoria<T, X, R> = {
  indice: Indice<X>;
  partes: Map<string, T[]>;
  /** Lista armada: se reutiliza mientras no cambie nada. */
  armado?: { vigencia: string; valor: R };
};

const enMemoria = new Map<string, EnMemoria<unknown, unknown, unknown>>();
const enCurso = new Map<string, Promise<unknown>>();

/** Almacén del que salió lo que está en memoria: si cambia, se vuelve a leer. */
let almacenDeLaMemoria: unknown;

async function cargar<T, X, R>(base: string): Promise<EnMemoria<T, X, R>> {
  if (almacenDeLaMemoria !== almacenLocal()) {
    enMemoria.clear();
    almacenDeLaMemoria = almacenLocal();
  }
  const guardado = enMemoria.get(base);
  if (guardado) return guardado as EnMemoria<T, X, R>;
  const almacen = almacenLocal();
  const indice = (await almacen.leer<Indice<X>>(`${base}indice`)) ?? {
    version: 1,
    partes: {},
  };
  const partes = new Map<string, T[]>();
  for (const parte of Object.keys(indice.partes)) {
    const elementos = await almacen.leer<T[]>(`${base}p|${parte}`);
    // Una parte que falta se vuelve a pedir: se la saca del índice.
    if (elementos) partes.set(parte, elementos);
    else delete indice.partes[parte];
  }
  const entrada: EnMemoria<T, X, R> = { indice, partes };
  enMemoria.set(base, entrada as EnMemoria<unknown, unknown, unknown>);
  return entrada;
}

function armado<T, X, R>(
  entrada: EnMemoria<T, X, R>,
  lista: ListaPorPartes<T, X, R>,
): R {
  const vigencia = lista.vigencia?.() ?? "";
  if (entrada.armado?.vigencia !== vigencia)
    entrada.armado = {
      vigencia,
      valor: lista.armar(entrada.partes.values(), entrada.indice.extra),
    };
  return entrada.armado.valor;
}

async function sincronizar<T, X, R>(
  lista: ListaPorPartes<T, X, R>,
): Promise<R> {
  const { base } = lista;
  const entrada = await cargar<T, X, R>(base);
  const almacen = almacenLocal();
  let versiones: Versiones<X>;
  try {
    versiones = await lista.versiones(entrada.indice.extra);
  } catch (error) {
    // Sin conexión: lo guardado en la PC, si hay.
    if (error instanceof SinConexionError && entrada.partes.size)
      return armado(entrada, lista);
    throw error;
  }
  const guardarIndice = () =>
    almacen.guardar(`${base}indice`, entrada.indice).catch(() => {});
  if (versiones.extra !== undefined) {
    entrada.indice.extra = versiones.extra;
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
    let respuesta: Partes<T>;
    try {
      respuesta = await lista.partes(tanda);
    } catch (error) {
      // Se cortó en el medio: queda lo que ya se actualizó.
      if (error instanceof SinConexionError && entrada.partes.size) break;
      throw error;
    }
    const porParte = new Map<string, T[]>(tanda.map((parte) => [parte, []]));
    for (const elemento of respuesta.elementos)
      porParte.get(lista.parteDe(elemento))?.push(elemento);
    for (const [parte, elementos] of porParte) {
      const version = respuesta.versiones[parte];
      if (!version) {
        delete entrada.indice.partes[parte];
        entrada.partes.delete(parte);
        await almacen.borrar(`${base}p|${parte}`).catch(() => {});
        continue;
      }
      entrada.partes.set(parte, elementos);
      entrada.indice.partes[parte] = version;
      await almacen.guardar(`${base}p|${parte}`, elementos).catch(() => {});
    }
    entrada.armado = undefined;
    // Se guarda el índice después de cada tanda: un corte no pierde lo bajado.
    await guardarIndice();
  }
  return armado(entrada, lista);
}

/**
 * Lista al día, bajando sólo lo que cambió. Si hay una actualización en curso
 * para la misma lista, espera esa en lugar de pedir todo otra vez. Mientras
 * nada cambie devuelve la misma lista (la pantalla no se redibuja).
 */
export function copiaAlDia<T, X, R>(
  lista: ListaPorPartes<T, X, R>,
): Promise<R> {
  const previa = enCurso.get(lista.base);
  if (previa) return previa as Promise<R>;
  const promesa = sincronizar(lista).finally(() => {
    enCurso.delete(lista.base);
  });
  enCurso.set(lista.base, promesa);
  return promesa;
}

/** Olvida lo que está en memoria (al cerrar sesión y en los tests). */
export function olvidarCopiasEnMemoria() {
  enMemoria.clear();
  enCurso.clear();
}
