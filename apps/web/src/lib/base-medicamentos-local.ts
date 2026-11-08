import { almacenLocal } from "./almacen-local";
import type { MedicineReference } from "./api";
import { externalGtin } from "./external-product";
import type { PurchasePack } from "./purchase-pack";

// Base de medicamentos en la PC (SISTEMA-69): la misma que usa el servidor,
// para buscar medicamentos y exhibidores sin conexión. Se baja entera y se
// renueva sólo cuando cambia (la actualización de precios de las 9 y las 17).
// Es la misma para todos los usuarios y farmacias: no tiene datos propios.

/** Fila de la base como la manda el servidor (claves cortas). */
export type MedicamentoBase = {
  n: string;
  p: string;
  l: string;
  d: string;
  f: string;
  s: string;
  t: string;
  o: string;
  pr: string;
  u: string;
  b: string[];
  x?: 1;
};
export type BaseMedicamentos = {
  version: string;
  items: MedicamentoBase[];
  packs: PurchasePack[];
  guardada: number;
};

const CLAVE = "base-medicamentos";
const PREFIJO_EXHIBIDOR = "exhibidor-pendiente|";
const RESULTADOS = 30;

type Indice = {
  base: BaseMedicamentos;
  textos: string[];
  nombres: string[];
  porCodigo: Map<string, number[]>;
};
let indice: Promise<Indice | undefined> | undefined;

/** Igual que el servidor: sin acentos, en minúscula y con espacios simples. */
export const textoDeBusqueda = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();

const claveDeCodigo = (codigo: string) =>
  externalGtin(codigo.trim()) ?? codigo.trim();

export async function leerBaseMedicamentos() {
  return almacenLocal().leer<BaseMedicamentos>(CLAVE);
}

/** Versión que tiene la PC, para no volver a bajar la misma. */
export async function versionBaseMedicamentos() {
  return (await leerBaseMedicamentos().catch(() => undefined))?.version;
}

export async function guardarBaseMedicamentos(
  base: Omit<BaseMedicamentos, "guardada">,
) {
  await almacenLocal().guardar(CLAVE, { ...base, guardada: Date.now() });
  indice = undefined;
}

function armarIndice(base: BaseMedicamentos): Indice {
  const porCodigo = new Map<string, number[]>();
  base.items.forEach((item, posicion) => {
    for (const codigo of item.b) {
      const clave = claveDeCodigo(codigo);
      porCodigo.set(clave, [...(porCodigo.get(clave) ?? []), posicion]);
    }
  });
  return {
    base,
    textos: base.items.map((item) =>
      textoDeBusqueda([item.n, item.p, item.l, item.d].join(" ")),
    ),
    nombres: base.items.map((item) => textoDeBusqueda(item.n)),
    porCodigo,
  };
}

function leerIndice() {
  indice ??= leerBaseMedicamentos()
    .then((base) => (base?.items.length ? armarIndice(base) : undefined))
    .catch(() => undefined);
  return indice;
}

/** Sólo para tests. */
export function olvidarIndice() {
  indice = undefined;
}

function referencia(item: MedicamentoBase, codigo: string): MedicineReference {
  return {
    source: item.o as MedicineReference["source"],
    name: item.n,
    presentation: item.p,
    laboratory: item.l,
    activeIngredient: item.d,
    barcode: codigo,
    troquel: item.t,
    priceMinor: Number(item.pr),
    pamiPriceMinor: null,
    updatedAt: item.u,
    saleType: item.s,
    pharmaceuticalForm: item.f,
    ...(item.s ? { prescriptionRequired: /receta/i.test(item.s) } : {}),
    ...(item.x ? { officialDelisted: true } : {}),
  };
}

/** ¿Hay base guardada en la PC? */
export async function hayBaseMedicamentos() {
  return Boolean(await leerIndice());
}

/** Medicamentos con ese código de barras. */
export async function medicamentosPorCodigo(
  codigo: string,
): Promise<MedicineReference[]> {
  const datos = await leerIndice();
  if (!datos) return [];
  return (datos.porCodigo.get(claveDeCodigo(codigo)) ?? []).map((posicion) =>
    referencia(datos.base.items[posicion]!, codigo.trim()),
  );
}

/**
 * Busca como el servidor: por código, o por todas las palabras en nombre,
 * presentación, laboratorio y droga; primero los nombres que empiezan con lo
 * buscado.
 */
export async function buscarMedicamentosEnLaPc(
  consulta: string,
): Promise<MedicineReference[]> {
  if (/^\d{8,14}$/.test(consulta.trim()))
    return medicamentosPorCodigo(consulta);
  const datos = await leerIndice();
  if (!datos) return [];
  const palabras = textoDeBusqueda(consulta)
    .split(/[^a-z0-9]+/)
    .filter((palabra) => palabra.length >= 2);
  if (!palabras.length) return [];
  const inicio = textoDeBusqueda(consulta);
  const encontrados: number[] = [];
  datos.textos.forEach((texto, posicion) => {
    if (palabras.every((palabra) => texto.includes(palabra)))
      encontrados.push(posicion);
  });
  return encontrados
    .sort(
      (a, b) =>
        Number(!datos.nombres[a]!.startsWith(inicio)) -
          Number(!datos.nombres[b]!.startsWith(inicio)) || a - b,
    )
    .slice(0, RESULTADOS)
    .map((posicion) => {
      const item = datos.base.items[posicion]!;
      return referencia(item, item.b[0] ?? "");
    });
}

// --- Exhibidores: los de la base más los armados sin conexión en esta PC.

type ExhibidorPendiente = { organizationId: string; pack: PurchasePack };

async function exhibidoresPendientes() {
  const almacen = almacenLocal();
  const claves = await almacen.claves(PREFIJO_EXHIBIDOR);
  const todos = await Promise.all(
    claves.map((clave) => almacen.leer<ExhibidorPendiente>(clave)),
  );
  return todos.filter((item): item is ExhibidorPendiente => Boolean(item));
}

/** Exhibidores conocidos en la PC, opcionalmente sólo de esos códigos. */
export async function exhibidoresEnLaPc(
  codigos?: readonly string[],
): Promise<PurchasePack[]> {
  const base = await leerBaseMedicamentos().catch(() => undefined);
  const porCodigo = new Map(
    (base?.packs ?? []).map((pack) => [claveDeCodigo(pack.barcode), pack]),
  );
  for (const { pack } of await exhibidoresPendientes().catch(() => []))
    porCodigo.set(claveDeCodigo(pack.barcode), pack);
  const buscados = codigos && new Set(codigos.map(claveDeCodigo));
  return [...porCodigo.entries()]
    .filter(([clave]) => !buscados || buscados.has(clave))
    .map(([, pack]) => pack);
}

/** Exhibidor armado sin conexión: se usa ya y se manda al volver. */
export async function guardarExhibidorPendiente(
  organizationId: string,
  pack: PurchasePack,
) {
  await almacenLocal().guardar(`${PREFIJO_EXHIBIDOR}${pack.barcode}`, {
    organizationId,
    pack,
  } satisfies ExhibidorPendiente);
}

/**
 * Manda los exhibidores armados sin conexión. Si el servidor rechaza uno (por
 * ejemplo, el envase ya no está en la base) se descarta: la compra ya llevó
 * sus unidades, el exhibidor sólo sirve para reconocerlo la próxima vez.
 */
export async function enviarExhibidoresPendientes(
  enviar: (organizationId: string, pack: PurchasePack) => Promise<void>,
  esFaltaDeConexion: (error: unknown) => boolean,
) {
  for (const { organizationId, pack } of await exhibidoresPendientes()) {
    try {
      await enviar(organizationId, pack);
    } catch (error) {
      if (esFaltaDeConexion(error)) return;
      console.error("Exhibidor sin conexión rechazado", pack, error);
    }
    await almacenLocal().borrar(`${PREFIJO_EXHIBIDOR}${pack.barcode}`);
  }
}
