import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-fetch";
import { refreshSession, SesionDeOtroUsuarioError } from "./api";
import { marcarEnLinea } from "./conectividad";
import {
  ESTA_PESTANA,
  PestanaPausadaError,
  avisarOtrasPestanas,
  decidirTrasRenovar,
  escucharOtrasPestanas,
  frenaPedido,
  pausarPedidos,
  reanudarPedidos,
  usuarioDelToken,
} from "./sesion-entre-pestanas";

/** Token con el usuario `sub` (sin firma válida: la valida el servidor). */
const tokenDe = (sub: string) =>
  `x.${btoa(JSON.stringify({ sub })).replaceAll("=", "")}.y`;

afterEach(() => {
  reanudarPedidos();
  vi.unstubAllGlobals();
});

describe("sesión de otro usuario en otra pestaña", () => {
  it("lee el usuario del token y no se rompe con uno ilegible", () => {
    expect(usuarioDelToken(tokenDe("cajero"))).toBe("cajero");
    expect(usuarioDelToken("no-es-un-token")).toBeUndefined();
  });

  it("sigue con el token si es del mismo usuario", () => {
    expect(
      decidirTrasRenovar("cajero", { tipo: "ok", token: tokenDe("cajero") }),
    ).toEqual({ accion: "seguir", token: tokenDe("cajero") });
  });

  it("pausa si la API avisa que la sesión es de otro, con su email", () => {
    expect(
      decidirTrasRenovar("cajero", {
        tipo: "otro-usuario",
        email: "duena@example.com",
      }),
    ).toEqual({ accion: "pausar", otroEmail: "duena@example.com" });
  });

  it("pausa aunque llegue un token de otro usuario (nunca cambia sola)", () => {
    expect(
      decidirTrasRenovar("cajero", { tipo: "ok", token: tokenDe("duena") }),
    ).toEqual({ accion: "pausar" });
  });

  it("al cerrar sesión en otra pestaña va al ingreso con su aviso", () => {
    expect(decidirTrasRenovar("cajero", { tipo: "vencida" }, "cierre")).toEqual(
      { accion: "ingresar", aviso: "Se cerró la sesión en otra pestaña." },
    );
    expect(decidirTrasRenovar("cajero", { tipo: "vencida" })).toEqual({
      accion: "ingresar",
      aviso: "La sesión venció. Iniciá sesión nuevamente.",
    });
  });

  it("sin conexión o con error del servidor reintenta", () => {
    expect(decidirTrasRenovar("cajero", { tipo: "fallo" })).toEqual({
      accion: "reintentar",
    });
  });

  it("avisa a las otras pestañas y no reacciona a su propio aviso", async () => {
    const oido = vi.fn();
    const dejar = escucharOtrasPestanas(oido);
    // Otra pestaña del navegador (otro canal con el mismo nombre).
    const otra = new BroadcastChannel("gestion-sesion");
    const recibidoEnOtra = new Promise<unknown>((resolve) => {
      otra.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    avisarOtrasPestanas("inicio");
    expect(await recibidoEnOtra).toEqual({
      tipo: "inicio",
      origen: ESTA_PESTANA,
    });
    const llego = new Promise<void>((resolve) => {
      oido.mockImplementation(() => resolve());
    });
    otra.postMessage({ tipo: "cierre", origen: "otra-pestana" });
    await llego;
    expect(oido).toHaveBeenCalledWith({
      tipo: "cierre",
      origen: "otra-pestana",
    });
    otra.close();
    dejar();
  });
});

describe("pestaña pausada", () => {
  it("no manda ningún pedido salvo el ingreso con contraseña", async () => {
    marcarEnLinea();
    const red = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", red);
    pausarPedidos();
    expect(frenaPedido("http://api/api/v1/organizations/o/sales")).toBe(true);
    expect(frenaPedido("/api/v1/auth/login")).toBe(false);
    await expect(
      apiFetch("http://api/api/v1/organizations/o/sales", { method: "POST" }),
    ).rejects.toBeInstanceOf(PestanaPausadaError);
    await expect(
      apiFetch("http://api/api/v1/organizations/o/products"),
    ).rejects.toBeInstanceOf(PestanaPausadaError);
    expect(red).not.toHaveBeenCalled();
    await apiFetch("http://api/api/v1/auth/login", { method: "POST" });
    expect(red).toHaveBeenCalledTimes(1);
    reanudarPedidos();
    expect(frenaPedido("http://api/api/v1/organizations/o/sales")).toBe(false);
  });

  it("la renovación manda el usuario esperado y reconoce la sesión de otro", async () => {
    const red = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "SESION_DE_OTRO_USUARIO",
          details: { email: "duena@example.com" },
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", red);
    const error = await refreshSession("cajero").catch((cause) => cause);
    expect(error).toBeInstanceOf(SesionDeOtroUsuarioError);
    expect((error as SesionDeOtroUsuarioError).email).toBe("duena@example.com");
    expect(JSON.parse(String(red.mock.calls[0]![1].body))).toEqual({
      usuarioEsperado: "cajero",
    });
  });
});
