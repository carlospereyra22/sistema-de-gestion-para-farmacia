import { createHmac } from "node:crypto";

/**
 * Reglas de vigencia de las sesiones (SISTEMA-93). Sin base de datos, para
 * probarlas aparte.
 */

/** Mínimo de inactividad: 24 h sin internet más un fin de semana de margen. */
export const INACTIVIDAD_MINIMA_DIAS = 3;
export const INACTIVIDAD_POR_DEFECTO_DIAS = 7;
/**
 * La clave anterior a una rotación sigue valiendo este rato: varias pestañas o
 * un reintento por mala conexión pueden renovar casi a la vez con la vieja.
 */
export const GRACIA_ROTACION_MS = 2 * 60_000;
/**
 * Superadmin (SISTEMA-94): su sesión nunca queda abierta en una PC ajena.
 * Vence a las 12 h aunque se use y a la hora sin uso; la cookie no es
 * persistente (se borra al cerrar el navegador).
 */
export const PLATAFORMA_SESION_MAXIMA_MS = 12 * 60 * 60_000;
export const PLATAFORMA_SESION_INACTIVIDAD_MS = 60 * 60_000;

/** Cuántas claves retiradas se recuerdan para detectar una cookie copiada. */
export const CLAVES_RETIRADAS = 5;

const DIA_MS = 86_400_000;

/** Inactividad efectiva en ms: nunca menos que el mínimo, pase lo que pase. */
export function inactividadMs(dias: number | undefined): number {
  const valor =
    dias && Number.isFinite(dias) ? dias : INACTIVIDAD_POR_DEFECTO_DIAS;
  return Math.max(valor, INACTIVIDAD_MINIMA_DIAS) * DIA_MS;
}

/** ¿La sesión venció por no usarse? */
export function vencidaPorInactividad(
  ultimoUso: Date,
  ahora: Date,
  limiteMs: number,
): boolean {
  return ahora.getTime() - ultimoUso.getTime() > limiteMs;
}

/**
 * Clave que sigue a la presentada (SISTEMA-101). Se deriva de la anterior con
 * un secreto del servidor en vez de sortearse: si la respuesta de una
 * renovación se pierde (Wi-Fi que se corta, pestaña que se cierra) y la PC
 * reintenta con la clave anterior dentro del margen, el servidor le vuelve a
 * entregar la misma clave nueva. Antes el reintento andaba pero la cookie
 * quedaba vieja y, pasado el margen, la sesión se cortaba como si la hubieran
 * copiado. Sin el secreto del servidor nadie puede calcularla.
 */
export function claveSiguiente(
  secretoDelServidor: string,
  sessionId: string,
  secreto: string,
): string {
  return createHmac("sha256", secretoDelServidor)
    .update(`sesion:${sessionId}:${secreto}`)
    .digest("base64url");
}

/** Claves retiradas después de rotar: la anterior pasa adelante. */
export function retirar(
  anterior: string | null,
  retiradas: readonly string[],
): string[] {
  return (anterior ? [anterior, ...retiradas] : [...retiradas]).slice(
    0,
    CLAVES_RETIRADAS,
  );
}

/** Navegador y sistema en pocas palabras ("Edge · Windows"). Nada sensible. */
export function resumenNavegador(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const navegador = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Otro navegador";
  const sistema = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iPhone / iPad"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "otro sistema";
  return `${navegador} · ${sistema}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Separa la cookie "<sesión>.<secreto>"; undefined si no tiene esa forma. */
export function leerClaveDeSesion(
  token: string | undefined,
): { sessionId: string; secret: string } | undefined {
  if (!token) return undefined;
  const [sessionId, secret, extra] = token.split(".");
  return sessionId && UUID.test(sessionId) && secret && !extra
    ? { sessionId, secret }
    : undefined;
}
