import { createPublicKey, verify, type KeyObject } from "node:crypto";

// Firma de las ventas hechas sin conexión (SISTEMA-66). La PC firma el texto
// exacto de la venta con una clave del usuario que no se puede exportar
// (WebCrypto, ECDSA P-256, firma en formato r||s). Así otro usuario de la misma
// PC puede mandarla al volver la conexión y queda a nombre de quien la hizo.

function clave(publicKey: string): KeyObject | null {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    return key.asymmetricKeyType === "ec" &&
      key.asymmetricKeyDetails?.namedCurve === "prime256v1"
      ? key
      : null;
  } catch {
    return null;
  }
}

/** ¿Es una clave pública ECDSA P-256 en SPKI/base64? */
export function clavePublicaValida(publicKey: string) {
  return clave(publicKey) !== null;
}

/** ¿La firma corresponde a este texto y a esta clave? Nunca lanza. */
export function firmaValida(
  publicKey: string,
  payload: string,
  signature: string,
): boolean {
  const key = clave(publicKey);
  if (!key) return false;
  try {
    return verify(
      "sha256",
      Buffer.from(payload, "utf8"),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
