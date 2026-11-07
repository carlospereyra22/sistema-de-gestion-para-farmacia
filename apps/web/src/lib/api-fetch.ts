/** Evento que avisa que la API cortó por el estado de la suscripción. */
export const SUBSCRIPTION_RESTRICTED = "farmatec:suscripcion-restringida";

/**
 * `fetch` que avisa cuando la API responde 402, así la web actualiza el estado sin tocar
 * cada llamada. Se importa como `fetch` en los clientes de la API de farmacia.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  if (response.status === 402 && typeof window !== "undefined")
    window.dispatchEvent(new Event(SUBSCRIPTION_RESTRICTED));
  return response;
}
