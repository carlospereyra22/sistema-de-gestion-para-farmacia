import { almacenLocal } from "./almacen-local";
import type { CurrentUserProfile } from "./api";
import {
  PREFIJO_ACCESO,
  VIGENCIA_SIN_CONEXION_MS,
  alcanceDe,
  type SesionGuardada,
} from "./cache-local";

// Entrar sin conexión (SISTEMA-66): al entrar con conexión la PC guarda una
// huella de la contraseña (PBKDF2, nunca la contraseña) junto al perfil. Sin
// internet, quien entró en esa PC en las últimas 24 horas puede volver a entrar
// escribiendo su contraseña; alguien nuevo no, porque la PC no lo conoce.

const ITERACIONES = 150_000;
const INTENTOS_ANTES_DE_ESPERAR = 5;
const ESPERA_TRAS_INTENTOS_MS = 30_000;

export type AccesoGuardado = {
  version: 1;
  sal: string;
  iteraciones: number;
  huella: string;
  perfil: CurrentUserProfile;
  ultimaSincronizacion: number;
};

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (texto: string) =>
  Uint8Array.from(atob(texto), (letra) => letra.charCodeAt(0));

async function huellaDe(
  password: string,
  sal: Uint8Array<ArrayBuffer>,
  iteraciones: number,
) {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones },
    clave,
    256,
  );
  return base64(new Uint8Array(bits));
}

/** Compara sin cortar en la primera diferencia. */
function iguales(a: string, b: string) {
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferencia === 0;
}

/** Al entrar con conexión: guarda la huella para poder volver sin internet. */
export async function guardarAcceso(
  password: string,
  perfil: CurrentUserProfile,
  ahora = Date.now(),
  iteraciones = ITERACIONES,
) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const acceso: AccesoGuardado = {
    version: 1,
    sal: base64(sal),
    iteraciones,
    huella: await huellaDe(password, sal, iteraciones),
    perfil,
    ultimaSincronizacion: ahora,
  };
  await almacenLocal().guardar(`${PREFIJO_ACCESO}${alcanceDe(perfil)}`, acceso);
}

export const SIN_ACCESO_GUARDADO =
  "Sin conexión sólo pueden entrar quienes usaron esta PC con internet en las últimas 24 horas. Esperá a que vuelva internet.";
export const CLAVE_INCORRECTA = "Email o contraseña incorrectos.";

let fallidos = 0;
let esperarHasta = 0;

export type ResultadoAcceso =
  { ok: true; sesion: SesionGuardada } | { ok: false; motivo: string };

/** Verifica email y contraseña contra lo guardado en la PC. */
export async function entrarSinConexion(
  email: string,
  password: string,
  ahora = Date.now(),
): Promise<ResultadoAcceso> {
  if (ahora < esperarHasta)
    return {
      ok: false,
      motivo: "Demasiados intentos. Esperá unos segundos y volvé a probar.",
    };
  const alcance = alcanceDe({ email });
  const acceso = await almacenLocal().leer<AccesoGuardado>(
    `${PREFIJO_ACCESO}${alcance}`,
  );
  if (
    acceso?.version !== 1 ||
    ahora - acceso.ultimaSincronizacion > VIGENCIA_SIN_CONEXION_MS ||
    // Un reloj de la PC atrasado no extiende la vigencia.
    acceso.ultimaSincronizacion - ahora > 5 * 60_000
  )
    return { ok: false, motivo: SIN_ACCESO_GUARDADO };
  const huella = await huellaDe(
    password,
    bytes(acceso.sal),
    acceso.iteraciones,
  );
  if (!iguales(huella, acceso.huella)) {
    fallidos++;
    if (fallidos >= INTENTOS_ANTES_DE_ESPERAR) {
      fallidos = 0;
      esperarHasta = ahora + ESPERA_TRAS_INTENTOS_MS;
    }
    return { ok: false, motivo: CLAVE_INCORRECTA };
  }
  fallidos = 0;
  return {
    ok: true,
    sesion: {
      alcance,
      perfil: acceso.perfil,
      ultimaSincronizacion: acceso.ultimaSincronizacion,
    },
  };
}

/** Sólo para tests: vuelve a cero los intentos fallidos. */
export function reiniciarIntentos() {
  fallidos = 0;
  esperarHasta = 0;
}
