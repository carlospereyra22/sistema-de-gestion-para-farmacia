import { almacenLocal } from "./almacen-local";
import type { CurrentUserProfile } from "./api";

// Copia local para trabajar sin conexión (SISTEMA-62). Guarda las respuestas
// de las consultas que hacen falta para abrir la app y consultar stock y
// precios, separadas por usuario. Nunca es autoridad: al volver la conexión se
// reemplaza por lo que diga el servidor.

/** Token con el que la app trabaja sin conexión: nunca sale a la red. */
export const TOKEN_SIN_CONEXION = "sin-conexion";
/** Una PC puede abrir sin conexión hasta 24 h desde la última sincronización. */
export const VIGENCIA_SIN_CONEXION_MS = 24 * 60 * 60 * 1000;
/** Encabezado que marca una respuesta servida desde la copia local. */
export const ENCABEZADO_COPIA_LOCAL = "x-gestion-copia-local";

const TAMANO_MAXIMO = 8 * 1024 * 1024;
const CLAVE_SESION = "sesion";
const CADA_CUANTO_ANOTAR_MS = 60_000;

/** Consultas que se guardan (ruta relativa a /api/v1, sin parámetros). */
const RUTAS_GUARDADAS = [
  /^\/organizations\/[^/]+\/branches$/,
  /^\/organizations\/[^/]+\/catalog\/(products|price-lists|effective-prices|medicine-references\/packs)$/,
  /^\/organizations\/[^/]+\/customers$/,
  /^\/organizations\/[^/]+\/branches\/[^/]+\/(inventory\/stock|cash|customer-accounts|sales\/fiscal-options)$/,
  /^\/organizations\/[^/]+\/subscription\/status$/,
  /^\/organizations\/[^/]+\/ticket-header$/,
];

let alcance: string | undefined;
let ultimaSincronizacion: number | undefined;
let ultimaAnotada = 0;

/** Usuario dueño de la copia local en uso (vacío: no se guarda nada). */
export function usarAlcance(valor: string | undefined) {
  alcance = valor?.trim().toLowerCase() || undefined;
}

export function alcanceDe(perfil: Pick<CurrentUserProfile, "email">) {
  return perfil.email.trim().toLowerCase();
}

/** Ruta y parámetros de una llamada a la API, sin el dominio ni /api/v1. */
export function rutaApi(url: string): { ruta: string; consulta: string } {
  const parsed = new URL(url, "http://local");
  const inicio = parsed.pathname.indexOf("/api/v1/");
  const ruta =
    inicio >= 0 ? parsed.pathname.slice(inicio + "/api/v1".length) : "";
  return { ruta, consulta: parsed.search };
}

export function seGuarda(url: string, metodo: string) {
  if (metodo !== "GET") return false;
  const { ruta } = rutaApi(url);
  return RUTAS_GUARDADAS.some((patron) => patron.test(ruta));
}

function claveDe(url: string) {
  const { ruta, consulta } = rutaApi(url);
  return `${alcance}|${ruta}${consulta}`;
}

type Guardado = { cuerpo: string; guardado: number };

export async function guardarRespuesta(url: string, respuesta: Response) {
  if (!alcance || !respuesta.ok || !seGuarda(url, "GET")) return;
  if (!(respuesta.headers.get("content-type") ?? "").includes("json")) return;
  const cuerpo = await respuesta.clone().text();
  if (cuerpo.length > TAMANO_MAXIMO) return;
  const guardado: Guardado = { cuerpo, guardado: Date.now() };
  await almacenLocal().guardar(claveDe(url), guardado);
}

export async function respuestaGuardada(
  url: string,
): Promise<Response | undefined> {
  if (!alcance || !seGuarda(url, "GET")) return undefined;
  const guardado = await almacenLocal().leer<Guardado>(claveDe(url));
  if (!guardado) return undefined;
  return new Response(guardado.cuerpo, {
    status: 200,
    headers: {
      "content-type": "application/json",
      [ENCABEZADO_COPIA_LOCAL]: String(guardado.guardado),
    },
  });
}

// --- Sesión guardada: con quién y hasta cuándo se puede abrir sin conexión.

export type SesionGuardada = {
  alcance: string;
  perfil: CurrentUserProfile;
  ultimaSincronizacion: number;
};

export function sesionVigente(
  sesion: SesionGuardada | undefined,
  ahora: number,
): sesion is SesionGuardada {
  return (
    !!sesion &&
    ahora - sesion.ultimaSincronizacion <= VIGENCIA_SIN_CONEXION_MS &&
    // Un reloj de la PC atrasado no extiende la vigencia.
    sesion.ultimaSincronizacion - ahora <= 5 * 60_000
  );
}

export async function guardarSesion(perfil: CurrentUserProfile) {
  const sesion: SesionGuardada = {
    alcance: alcanceDe(perfil),
    perfil,
    ultimaSincronizacion: Date.now(),
  };
  const almacen = almacenLocal();
  // Otra persona entró en esta PC: su copia no queda para el usuario anterior.
  const anterior = await leerSesion();
  if (anterior && anterior.alcance !== sesion.alcance)
    for (const clave of await almacen.claves(`${anterior.alcance}|`))
      await almacen.borrar(clave);
  ultimaSincronizacion = sesion.ultimaSincronizacion;
  ultimaAnotada = sesion.ultimaSincronizacion;
  await almacen.guardar(CLAVE_SESION, sesion);
}

export function leerSesion() {
  return almacenLocal().leer<SesionGuardada>(CLAVE_SESION);
}

/** Anota que el servidor respondió (como mucho una vez por minuto). */
export function marcarSincronizado(ahora = Date.now()) {
  if (!alcance) return;
  ultimaSincronizacion = ahora;
  if (ahora - ultimaAnotada < CADA_CUANTO_ANOTAR_MS) return;
  ultimaAnotada = ahora;
  void leerSesion()
    .then((sesion) =>
      sesion && sesion.alcance === alcance
        ? almacenLocal().guardar(CLAVE_SESION, {
            ...sesion,
            ultimaSincronizacion: ahora,
          })
        : undefined,
    )
    .catch(() => {});
}

/** Última vez que el servidor respondió, para mostrar "datos de las HH:MM". */
export function horaUltimaSincronizacion() {
  return ultimaSincronizacion;
}

/** Al abrir sin conexión se parte de la hora guardada en la sesión. */
export function usarSincronizacionGuardada(valor: number) {
  ultimaSincronizacion = valor;
}

/** Cerrar sesión: se borra la copia y ya no se puede abrir sin conexión. */
export async function borrarCopiaLocal() {
  const almacen = almacenLocal();
  const sesion = await leerSesion();
  const dueno = sesion?.alcance ?? alcance;
  await almacen.borrar(CLAVE_SESION);
  if (dueno)
    for (const clave of await almacen.claves(`${dueno}|`))
      await almacen.borrar(clave);
  usarAlcance(undefined);
  ultimaSincronizacion = undefined;
}
