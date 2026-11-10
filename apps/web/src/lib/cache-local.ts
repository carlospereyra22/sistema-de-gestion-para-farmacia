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
/**
 * Datos para volver a entrar sin conexión, uno por usuario de la PC
 * (SISTEMA-66): perfil, última sincronización y huella de la contraseña.
 */
export const PREFIJO_ACCESO = "acceso|";
const CADA_CUANTO_ANOTAR_MS = 60_000;

/**
 * Consultas que se guardan (ruta relativa a /api/v1). Desde SISTEMA-66 todas
 * las de datos de la farmacia, para que cualquier pantalla ya abierta con
 * conexión se pueda consultar sin ella. Nunca las de sesión ni de plataforma
 * (no están bajo /organizations).
 */
const RUTAS_GUARDADAS = [/^\/organizations\/[^/]+(\/.*)?$/];

/**
 * El catálogo por partes lo guarda `catalogo-local.ts`, parte por parte
 * (SISTEMA-74): copiarlo además acá duplicaría decenas de MB.
 */
const RUTAS_NO_GUARDADAS = [/\/catalog\/products\/(partes|versiones)$/];

let alcance: string | undefined;
let ultimaSincronizacion: number | undefined;
let ultimaAnotada = 0;

/** Usuario dueño de la copia local en uso (vacío: no se guarda nada). */
export function usarAlcance(valor: string | undefined) {
  alcance = valor?.trim().toLowerCase() || undefined;
}

/** Usuario dueño de la copia local en uso, si hay sesión. */
export function alcanceActual() {
  return alcance;
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
  return (
    RUTAS_GUARDADAS.some((patron) => patron.test(ruta)) &&
    !RUTAS_NO_GUARDADAS.some((patron) => patron.test(ruta))
  );
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
  // Varias personas usan la PC (cambio de turno, SISTEMA-66): cada una
  // conserva su copia mientras pueda volver a entrar sin conexión.
  await olvidarUsuariosVencidos(sesion.ultimaSincronizacion, sesion.alcance);
  await anotarAcceso(sesion.alcance, sesion.ultimaSincronizacion, perfil);
  ultimaSincronizacion = sesion.ultimaSincronizacion;
  ultimaAnotada = sesion.ultimaSincronizacion;
  await almacen.guardar(CLAVE_SESION, sesion);
}

/** Abre sin conexión a quien entró con su contraseña en la PC. */
export async function activarSesionGuardada(sesion: SesionGuardada) {
  ultimaSincronizacion = sesion.ultimaSincronizacion;
  ultimaAnotada = sesion.ultimaSincronizacion;
  await almacenLocal().guardar(CLAVE_SESION, sesion);
}

type AccesoParcial = {
  perfil?: CurrentUserProfile;
  ultimaSincronizacion?: number;
};

/** Actualiza el perfil y la sincronización del acceso del usuario, si tiene. */
async function anotarAcceso(
  dueno: string,
  ahora: number,
  perfil?: CurrentUserProfile,
) {
  const almacen = almacenLocal();
  const acceso = await almacen.leer<AccesoParcial>(`${PREFIJO_ACCESO}${dueno}`);
  if (!acceso) return;
  await almacen.guardar(`${PREFIJO_ACCESO}${dueno}`, {
    ...acceso,
    ultimaSincronizacion: ahora,
    ...(perfil ? { perfil } : {}),
  });
}

/**
 * Borra la copia y el acceso de quienes ya no pueden entrar sin conexión
 * (más de 24 h sin sincronizar). Las ventas sin enviar nunca se borran acá.
 */
export async function olvidarUsuariosVencidos(ahora: number, actual?: string) {
  const almacen = almacenLocal();
  const todas = await almacen.claves("");
  // Dueños: los que tienen acceso guardado y los que tienen copia (email|...).
  const duenos = new Set<string>();
  for (const clave of todas)
    if (clave.startsWith(PREFIJO_ACCESO))
      duenos.add(clave.slice(PREFIJO_ACCESO.length));
    else if (/^[^|]+@[^|]+\|/.test(clave)) duenos.add(clave.split("|")[0]!);
  for (const dueno of duenos) {
    if (dueno === actual) continue;
    const acceso = await almacen.leer<AccesoParcial>(
      `${PREFIJO_ACCESO}${dueno}`,
    );
    if (
      acceso?.ultimaSincronizacion &&
      ahora - acceso.ultimaSincronizacion <= VIGENCIA_SIN_CONEXION_MS
    )
      continue;
    await almacen.borrar(`${PREFIJO_ACCESO}${dueno}`);
    for (const propia of todas)
      if (propia.startsWith(`${dueno}|`)) await almacen.borrar(propia);
  }
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
  const dueno = alcance;
  void leerSesion()
    .then((sesion) =>
      sesion && sesion.alcance === dueno
        ? almacenLocal().guardar(CLAVE_SESION, {
            ...sesion,
            ultimaSincronizacion: ahora,
          })
        : undefined,
    )
    .then(() => anotarAcceso(dueno, ahora))
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

/**
 * Cerrar sesión (SISTEMA-66): la app deja de abrirse sola, pero la copia y el
 * acceso quedan para volver a entrar con la contraseña, aun sin conexión.
 */
export async function cerrarSesionLocal() {
  await almacenLocal().borrar(CLAVE_SESION);
  usarAlcance(undefined);
  ultimaSincronizacion = undefined;
}

/**
 * La sesión venció o el usuario no trabaja sin conexión: se borra su copia y
 * su acceso; ya no puede abrir sin conexión.
 */
export async function borrarCopiaLocal() {
  const almacen = almacenLocal();
  const sesion = await leerSesion();
  const dueno = sesion?.alcance ?? alcance;
  await almacen.borrar(CLAVE_SESION);
  if (dueno) {
    await almacen.borrar(`${PREFIJO_ACCESO}${dueno}`);
    for (const clave of await almacen.claves(`${dueno}|`))
      await almacen.borrar(clave);
  }
  usarAlcance(undefined);
  ultimaSincronizacion = undefined;
}
