import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sesión del portal del catálogo (SISTEMA-107). Es independiente de la sesión
 * de la farmacia: otra cookie, otra tabla y otro alcance (sólo /catalogo).
 */

/** Cookie del portal. Va sólo a las rutas públicas del catálogo. */
export const COOKIE_PORTAL = "gestion_catalogo";
export const RUTA_COOKIE_PORTAL = "/api/v1/catalogo";
/** La sesión vence a los 30 días sin usarse. */
export const DURACION_SESION_PORTAL_MS = 30 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El secreto es aleatorio y largo: alcanza con sha256 (no es una contraseña). */
export const hashDelSecreto = (secreto: string) =>
  createHash("sha256").update(secreto).digest("hex");

export function nuevoSecreto(): { secreto: string; hash: string } {
  const secreto = randomBytes(48).toString("base64url");
  return { secreto, hash: hashDelSecreto(secreto) };
}

/** "<idDeSesion>.<secreto>" -> partes, o null si la cookie no tiene esa forma. */
export function leerCookiePortal(
  valor: unknown,
): { sessionId: string; secreto: string } | null {
  if (typeof valor !== "string" || valor.length > 200) return null;
  const punto = valor.indexOf(".");
  if (punto < 0) return null;
  const sessionId = valor.slice(0, punto);
  const secreto = valor.slice(punto + 1);
  if (!UUID.test(sessionId) || secreto.length < 20) return null;
  return { sessionId, secreto };
}

/** Compara el hash guardado con el del secreto recibido sin filtrar tiempos. */
export function secretoCoincide(hashGuardado: string, secreto: string) {
  const recibido = Buffer.from(hashDelSecreto(secreto), "hex");
  const guardado = Buffer.from(hashGuardado, "hex");
  return (
    recibido.length === guardado.length && timingSafeEqual(recibido, guardado)
  );
}
