import { useSyncExternalStore } from "react";

// Estado de conexión con el servidor (no con internet en general): el
// navegador puede decir que hay red mientras el servidor no responde.

export type EstadoConexion = {
  enLinea: boolean;
  /** Desde cuándo está en este estado. */
  desde: number;
};

let estado: EstadoConexion = { enLinea: true, desde: Date.now() };
const oyentes = new Set<() => void>();

export function conectividad(): EstadoConexion {
  return estado;
}

export function suscribirConectividad(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function cambiar(enLinea: boolean, ahora: number) {
  if (estado.enLinea === enLinea) return;
  estado = { enLinea, desde: ahora };
  for (const oyente of oyentes) oyente();
}

export function marcarEnLinea(ahora = Date.now()) {
  cambiar(true, ahora);
}

export function marcarSinConexion(ahora = Date.now()) {
  cambiar(false, ahora);
}

/**
 * ¿La respuesta (o el error) indica que el servidor no está disponible?
 * - error de red o tiempo agotado: sí;
 * - 502/503/504: sí (el proxy de Netlify devuelve eso con el VPS caído);
 * - otro 5xx con HTML en vez de JSON: sí (página de error de un proxy);
 * - cualquier otra respuesta de la API, aunque sea un error: no.
 */
export function esFallaDeConexion(
  respuesta: Pick<Response, "status" | "headers"> | undefined,
): boolean {
  if (!respuesta) return true;
  if ([502, 503, 504].includes(respuesta.status)) return true;
  if (respuesta.status >= 500) {
    const tipo = respuesta.headers.get("content-type") ?? "";
    return !tipo.includes("json");
  }
  return false;
}

export function useConectividad(): EstadoConexion {
  return useSyncExternalStore(
    suscribirConectividad,
    conectividad,
    conectividad,
  );
}

const SONDEO_MS = 15_000;

/**
 * Mientras no hay conexión, pregunta al servidor cada 15 segundos (y apenas el
 * navegador avisa que volvió la red) para detectar que volvió.
 */
export function iniciarSondeo(urlSalud: string) {
  if (typeof window === "undefined") return () => {};
  let timer: number | undefined;
  const probar = async () => {
    try {
      const respuesta = await globalThis.fetch(urlSalud, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!esFallaDeConexion(respuesta)) marcarEnLinea();
    } catch {
      /* sigue sin conexión */
    }
  };
  const programar = () => {
    window.clearInterval(timer);
    timer = undefined;
    if (!estado.enLinea)
      timer = window.setInterval(() => void probar(), SONDEO_MS);
  };
  const alVolverLaRed = () => void probar();
  const alPerderLaRed = () => marcarSinConexion();
  window.addEventListener("online", alVolverLaRed);
  window.addEventListener("offline", alPerderLaRed);
  const dejar = suscribirConectividad(programar);
  programar();
  return () => {
    dejar();
    window.clearInterval(timer);
    window.removeEventListener("online", alVolverLaRed);
    window.removeEventListener("offline", alPerderLaRed);
  };
}
