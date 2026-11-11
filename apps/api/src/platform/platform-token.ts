import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token de plataforma (SISTEMA-94): el acceso al panel queda atado a la pestaña
 * donde se ingresó el código. Reglas puras, sin base de datos.
 */

/** Sin pedidos durante este rato, se vuelve a pedir el código. */
export const PLATAFORMA_INACTIVIDAD_MS = 30 * 60_000;
/** Máximo absoluto de un token aunque se use todo el tiempo. */
export const PLATAFORMA_MAXIMO_MS = 8 * 60 * 60_000;
/** Cada cuánto se registra el uso (y se audita la renovación). */
export const PLATAFORMA_RENOVAR_CADA_MS = 5 * 60_000;
/** Encabezado con el que la web manda el token. */
export const ENCABEZADO_PLATAFORMA = "x-plataforma";

/**
 * El secreto es aleatorio de 256 bits: alcanza un sha256 (rápido, se compara
 * en cada pedido) en lugar de Argon2.
 */
export function hashDelSecreto(secreto: string): string {
  return createHash("sha256").update(secreto).digest("hex");
}

export function nuevoSecreto(): { secreto: string; hash: string } {
  const secreto = randomBytes(32).toString("base64url");
  return { secreto, hash: hashDelSecreto(secreto) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "<id>.<secreto>" del encabezado; undefined si no tiene esa forma. */
export function leerTokenDePlataforma(
  valor: string | string[] | undefined,
): { id: string; secreto: string } | undefined {
  if (typeof valor !== "string") return undefined;
  const [id, secreto, extra] = valor.split(".");
  return id && UUID.test(id) && secreto && !extra ? { id, secreto } : undefined;
}

export type TokenGuardado = {
  userId: string;
  sessionId: string;
  tokenHash: string;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type EstadoDelToken =
  | { valido: true; renovar: boolean }
  | {
      valido: false;
      motivo: "otro" | "secreto" | "revocado" | "vencido" | "inactivo";
    };

/**
 * ¿El token sirve para este pedido? Tiene que ser del mismo usuario y de la
 * misma sesión del access token: otra pestaña con la misma cookie no lo tiene.
 */
export function estadoDelToken(
  token: TokenGuardado,
  quien: { userId: string; sessionId: string },
  secreto: string,
  ahora: Date,
): EstadoDelToken {
  if (token.userId !== quien.userId || token.sessionId !== quien.sessionId)
    return { valido: false, motivo: "otro" };
  const esperado = Buffer.from(token.tokenHash, "hex");
  const recibido = Buffer.from(hashDelSecreto(secreto), "hex");
  if (
    esperado.length !== recibido.length ||
    !timingSafeEqual(esperado, recibido)
  )
    return { valido: false, motivo: "secreto" };
  if (token.revokedAt) return { valido: false, motivo: "revocado" };
  if (token.expiresAt <= ahora) return { valido: false, motivo: "vencido" };
  const sinUso = ahora.getTime() - token.lastUsedAt.getTime();
  if (sinUso > PLATAFORMA_INACTIVIDAD_MS)
    return { valido: false, motivo: "inactivo" };
  return { valido: true, renovar: sinUso >= PLATAFORMA_RENOVAR_CADA_MS };
}
