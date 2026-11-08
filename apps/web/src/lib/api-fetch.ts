import {
  ENCABEZADO_COPIA_LOCAL,
  TOKEN_SIN_CONEXION,
  guardarRespuesta,
  marcarSincronizado,
  respuestaGuardada,
} from "./cache-local";
import {
  esFallaDeConexion,
  marcarEnLinea,
  marcarSinConexion,
} from "./conectividad";
import { registrarHoraServidor } from "./venta-sin-conexion";

/** Evento que avisa que la API cortó por el estado de la suscripción. */
export const SUBSCRIPTION_RESTRICTED = "farmatec:suscripcion-restringida";

/** La operación necesita el servidor y no hay conexión. */
export class SinConexionError extends Error {
  constructor(
    message = "Sin conexión: esta operación necesita internet. Probá de nuevo cuando vuelva.",
  ) {
    super(message);
    this.name = "SinConexionError";
  }
}

function urlDe(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function metodoDe(input: RequestInfo | URL, init?: RequestInit) {
  return (
    init?.method ??
    (typeof input === "object" && "method" in input ? input.method : "GET")
  ).toUpperCase();
}

function trabajaSinConexion(init?: RequestInit) {
  return (
    new Headers(init?.headers).get("authorization") ===
    `Bearer ${TOKEN_SIN_CONEXION}`
  );
}

/** Errores de `fetch` que significan "no se pudo llegar al servidor". */
function esErrorDeRed(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError")
  );
}

/**
 * `fetch` de los clientes de la API de farmacia (se importa como `fetch`):
 * - avisa cuando la API responde 402 (corte por suscripción);
 * - guarda una copia local de las consultas que permiten abrir la app sin
 *   conexión, y la devuelve cuando el servidor no responde;
 * - sin conexión, las operaciones que escriben fallan con un mensaje claro.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = urlDe(input);
  const metodo = metodoDe(input, init);
  const sinConexion = trabajaSinConexion(init);
  let response: Response | undefined;
  if (!sinConexion) {
    try {
      response = await globalThis.fetch(input, init);
    } catch (error) {
      if (!esErrorDeRed(error)) throw error;
    }
  }
  if (response && !esFallaDeConexion(response)) {
    marcarEnLinea();
    marcarSincronizado();
    // Hora del servidor para las ventas sin conexión (los dobles de prueba
    // a veces no traen encabezados).
    if (response.headers instanceof Headers)
      registrarHoraServidor(response.headers.get("date"));
    if (response.status === 402 && typeof window !== "undefined")
      window.dispatchEvent(new Event(SUBSCRIPTION_RESTRICTED));
    if (metodo === "GET" && response.ok)
      void guardarRespuesta(url, response).catch(() => {});
    return response;
  }
  if (!sinConexion) marcarSinConexion();
  if (metodo === "GET") {
    const guardada = await respuestaGuardada(url).catch(() => undefined);
    if (guardada) return guardada;
    throw new SinConexionError(
      "Sin conexión y sin datos guardados de esta pantalla. Se actualiza cuando vuelva internet.",
    );
  }
  throw new SinConexionError();
}

/** ¿La respuesta salió de la copia local? Devuelve cuándo se guardó. */
export function guardadaEl(response: Response) {
  const valor = response.headers.get(ENCABEZADO_COPIA_LOCAL);
  return valor ? Number(valor) : undefined;
}
