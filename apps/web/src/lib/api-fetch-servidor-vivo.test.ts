import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, PedidoNoCompletadoError } from "./api-fetch";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { configurarSalud, conectividad, marcarEnLinea } from "./conectividad";

// SISTEMA-109: un servicio de afuera caído no puede dejar toda la app "Sin
// conexión". Antes de pasar a sin conexión se confirma con /health.
describe("apiFetch confirma con /health antes de pasar a sin conexión", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configurarSalud(undefined);
    marcarEnLinea();
  });

  const servidor = (pedido: () => Promise<Response>, saludOk: boolean) =>
    vi.fn((url: string) =>
      url === "/api/v1/health"
        ? saludOk
          ? Promise.resolve(new Response('{"status":"ok"}', { status: 200 }))
          : Promise.reject(new TypeError("Failed to fetch"))
        : pedido(),
    );

  it("AlfaBeta caído (502 en HTML de un proxy) con la API viva: sigue en línea", async () => {
    usarAlmacen(almacenEnMemoria());
    configurarSalud("/api/v1/health");
    marcarEnLinea();
    vi.stubGlobal(
      "fetch",
      servidor(
        () =>
          Promise.resolve(
            new Response("<html>Bad gateway</html>", {
              status: 502,
              headers: { "content-type": "text/html" },
            }),
          ),
        true,
      ),
    );
    const respuesta = await apiFetch("/api/v1/alfabeta?q=sertal");
    expect(respuesta.status).toBe(502);
    expect(conectividad().enLinea).toBe(true);
  });

  it("un servicio externo no configurado (503 en JSON) no corta la app", async () => {
    usarAlmacen(almacenEnMemoria());
    configurarSalud("/api/v1/health");
    marcarEnLinea();
    vi.stubGlobal(
      "fetch",
      servidor(
        () =>
          Promise.resolve(
            new Response('{"message":"Catálogo externo no configurado."}', {
              status: 503,
              headers: { "content-type": "application/json" },
            }),
          ),
        true,
      ),
    );
    const respuesta = await apiFetch("/api/v1/catalogo-externo");
    expect(respuesta.status).toBe(503);
    expect(conectividad().enLinea).toBe(true);
  });

  it("un pedido lento con la API viva avisa sin cortar la app", async () => {
    usarAlmacen(almacenEnMemoria());
    configurarSalud("/api/v1/health");
    marcarEnLinea();
    vi.stubGlobal(
      "fetch",
      servidor(
        () => Promise.reject(new DOMException("Tiempo", "TimeoutError")),
        true,
      ),
    );
    await expect(apiFetch("/api/v1/lento")).rejects.toBeInstanceOf(
      PedidoNoCompletadoError,
    );
    expect(conectividad().enLinea).toBe(true);
  });

  it("si /health tampoco responde, sí pasa a sin conexión", async () => {
    usarAlmacen(almacenEnMemoria());
    configurarSalud("/api/v1/health");
    marcarEnLinea();
    vi.stubGlobal(
      "fetch",
      servidor(() => Promise.reject(new TypeError("Failed to fetch")), false),
    );
    await expect(apiFetch("/api/v1/x", { method: "POST" })).rejects.toThrow();
    expect(conectividad().enLinea).toBe(false);
  });
});
