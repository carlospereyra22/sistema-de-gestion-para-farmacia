// Almacén clave-valor de la PC (IndexedDB) para la copia sin conexión. Detrás
// de una interfaz: los tests usan uno en memoria.

export interface AlmacenLocal {
  leer<T>(clave: string): Promise<T | undefined>;
  guardar(clave: string, valor: unknown): Promise<void>;
  borrar(clave: string): Promise<void>;
  /** Claves que empiezan con el prefijo. */
  claves(prefijo: string): Promise<string[]>;
  /** Valores de las claves que empiezan con el prefijo, en una sola lectura. */
  valores<T>(prefijo: string): Promise<T[]>;
}

export function almacenEnMemoria(): AlmacenLocal {
  const datos = new Map<string, unknown>();
  return {
    leer: async <T>(clave: string) =>
      structuredClone(datos.get(clave)) as T | undefined,
    guardar: async (clave, valor) => {
      datos.set(clave, structuredClone(valor));
    },
    borrar: async (clave) => {
      datos.delete(clave);
    },
    claves: async (prefijo) =>
      [...datos.keys()].filter((clave) => clave.startsWith(prefijo)),
    valores: async <T>(prefijo: string) =>
      [...datos.entries()]
        .filter(([clave]) => clave.startsWith(prefijo))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, valor]) => structuredClone(valor) as T),
  };
}

const BASE = "gestion-sin-conexion";
const TABLA = "datos";

function pedido<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function almacenIndexedDb(): AlmacenLocal {
  let abierta: Promise<IDBDatabase> | undefined;
  const base = () => {
    abierta ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(BASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TABLA))
          request.result.createObjectStore(TABLA);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        abierta = undefined;
        reject(request.error);
      };
    });
    return abierta;
  };
  const tabla = async (modo: IDBTransactionMode) =>
    (await base()).transaction(TABLA, modo).objectStore(TABLA);
  return {
    leer: async <T>(clave: string) =>
      (await pedido((await tabla("readonly")).get(clave))) as T | undefined,
    guardar: async (clave, valor) => {
      await pedido((await tabla("readwrite")).put(valor, clave));
    },
    borrar: async (clave) => {
      await pedido((await tabla("readwrite")).delete(clave));
    },
    claves: async (prefijo) =>
      (
        await pedido(
          (await tabla("readonly")).getAllKeys(
            IDBKeyRange.bound(prefijo, `${prefijo}￿`),
          ),
        )
      ).map(String),
    valores: async <T>(prefijo: string) =>
      (await pedido(
        (await tabla("readonly")).getAll(
          IDBKeyRange.bound(prefijo, `${prefijo}￿`),
        ),
      )) as T[],
  };
}

let actual: AlmacenLocal | undefined;

/** El almacén de la PC; en memoria si el navegador no tiene IndexedDB. */
export function almacenLocal(): AlmacenLocal {
  actual ??=
    typeof indexedDB === "undefined" ? almacenEnMemoria() : almacenIndexedDb();
  return actual;
}

/** Sólo para tests. */
export function usarAlmacen(almacen: AlmacenLocal | undefined) {
  actual = almacen;
}

/** Pide al navegador que no borre la copia cuando falta espacio. */
export function pedirPersistencia() {
  if (typeof navigator !== "undefined" && navigator.storage?.persist)
    void navigator.storage.persist().catch(() => {});
}
