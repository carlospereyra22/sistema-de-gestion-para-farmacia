import { almacenLocal } from "./almacen-local";

// Firma de las ventas sin conexión (SISTEMA-66). Cada usuario tiene en cada PC
// una clave ECDSA P-256 que el navegador no deja exportar. La pública se
// registra en el servidor al entrar con conexión; con la privada se firma el
// texto exacto de cada venta. Así otro usuario de la PC puede mandarla al
// volver internet y el servidor la registra a nombre de quien la hizo.

const PREFIJO = "clave|";

type ClaveGuardada = { privada: CryptoKey; publica: string };

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Clave del usuario en esta PC; la crea la primera vez. */
export async function claveDeEstaPc(alcance: string): Promise<ClaveGuardada> {
  const almacen = almacenLocal();
  const guardada = await almacen.leer<ClaveGuardada>(`${PREFIJO}${alcance}`);
  if (guardada?.privada && guardada.publica) return guardada;
  const par = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", par.publicKey);
  const nueva = {
    privada: par.privateKey,
    publica: base64(new Uint8Array(spki)),
  };
  await almacen.guardar(`${PREFIJO}${alcance}`, nueva);
  return nueva;
}

/** Firma el texto de una venta con la clave del usuario en esta PC. */
export async function firmarVenta(alcance: string, texto: string) {
  const { privada } = await claveDeEstaPc(alcance);
  const firma = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privada,
    new TextEncoder().encode(texto),
  );
  return base64(new Uint8Array(firma));
}
