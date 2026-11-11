import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  guardadaEl,
  SinConexionError,
  SUBSCRIPTION_RESTRICTED,
} from "./api-fetch";
import { almacenEnMemoria, usarAlmacen } from "./almacen-local";
import { TOKEN_SIN_CONEXION, usarAlcance } from "./cache-local";
import { conectividad, marcarEnLinea, marcarSinConexion } from "./conectividad";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const listen = () => {
    const target = new EventTarget();
    const heard = vi.fn();
    target.addEventListener(SUBSCRIPTION_RESTRICTED, heard);
    vi.stubGlobal("window", target);
    return heard;
  };

  it("avisa cuando la API corta por la suscripción", async () => {
    const heard = listen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 402 })),
    );

    const response = await apiFetch("/x");

    expect(response.status).toBe(402);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("no avisa ante otras respuestas", async () => {
    const heard = listen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
    );

    await apiFetch("/x");

    expect(heard).not.toHaveBeenCalled();
  });

  it("pasa la llamada tal cual", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const init = { method: "POST", body: "{}" };

    await apiFetch("/x", init);

    // Con un tiempo máximo, para que un pedido colgado no trabe todo (SISTEMA-74).
    expect(fetch).toHaveBeenCalledWith(
      "/x",
      expect.objectContaining({ ...init, signal: expect.any(AbortSignal) }),
    );
  });

  it("respeta la cancelación de quien llama", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await apiFetch("/x", { signal: controller.signal });
    const { signal } = fetch.mock.calls[0]![1] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe("apiFetch sin conexión", () => {
  const stock =
    "http://localhost:3000/api/v1/organizations/o1/branches/b1/inventory/stock";
  const auth = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` },
  });

  beforeEach(() => {
    usarAlmacen(almacenEnMemoria());
    usarAlcance("ana@farmacia.com");
    marcarEnLinea();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    usarAlcance(undefined);
  });

  async function guardarStock() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('[{"id":"lote"}]', {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await apiFetch(stock, auth("real"));
    // La copia se guarda en segundo plano.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("si la red falla, devuelve la copia local y marca sin conexión", async () => {
    await guardarStock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const response = await apiFetch(stock, auth("real"));

    expect(await response.json()).toEqual([{ id: "lote" }]);
    expect(guardadaEl(response)).toBeTypeOf("number");
    expect(conectividad().enLinea).toBe(false);
  });

  it("con la falta de conexión ya conocida no sale a la red (SISTEMA-74)", async () => {
    await guardarStock();
    marcarSinConexion();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await apiFetch(stock, auth("real"));

    expect(await response.json()).toEqual([{ id: "lote" }]);
    await expect(
      apiFetch(stock, { ...auth("real"), method: "POST" }),
    ).rejects.toBeInstanceOf(SinConexionError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("entrar prueba la red aunque la app esté marcada sin conexión", async () => {
    // Prueba de corte (10/11/2026): volvía el servidor y, hasta el próximo
    // sondeo, el ingreso con conexión ni salía a la red.
    marcarSinConexion();
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"accessToken":"t"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const response = await apiFetch(
      "/api/v1/auth/login",
      { method: "POST", body: "{}" },
      { probarRed: true },
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(conectividad().enLinea).toBe(true);
  });

  it("el proxy sin servidor (502) también usa la copia", async () => {
    await guardarStock();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Bad gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    expect(await (await apiFetch(stock, auth("real"))).json()).toEqual([
      { id: "lote" },
    ]);
  });

  it("con el token de sin conexión nunca sale a la red", async () => {
    await guardarStock();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const response = await apiFetch(stock, auth(TOKEN_SIN_CONEXION));

    expect(fetch).not.toHaveBeenCalled();
    expect(await response.json()).toEqual([{ id: "lote" }]);
  });

  it("sin conexión, las operaciones que escriben fallan con un mensaje claro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      apiFetch(stock, { ...auth("real"), method: "POST" }),
    ).rejects.toBeInstanceOf(SinConexionError);
  });

  it("sin copia guardada, una consulta falla con un mensaje claro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(apiFetch(stock, auth("real"))).rejects.toThrow(
      "sin datos guardados",
    );
  });

  it("un error de la API no es falta de conexión", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"message":"x"}', {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    expect((await apiFetch(stock, auth("real"))).status).toBe(403);
    expect(conectividad().enLinea).toBe(true);
  });
});
