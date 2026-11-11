import { afterEach, describe, expect, it, vi } from "vitest";
import { logout, refreshSession, sesionesAProbar } from "./api";

afterEach(() => vi.unstubAllGlobals());

const red = () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "t" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
const cuerpo = (fetch: ReturnType<typeof vi.fn>) =>
  JSON.parse(
    String((fetch.mock.calls[0]![1] as RequestInit).body ?? "{}"),
  ) as Record<string, unknown>;

describe("cookie propia del superadmin (SISTEMA-100)", () => {
  it("al abrir una pestaña prueba primero la sesión que va con la dirección", () => {
    expect(sesionesAProbar("/plataforma")).toEqual(["plataforma", "farmacia"]);
    expect(sesionesAProbar("/")).toEqual(["farmacia", "plataforma"]);
    expect(sesionesAProbar("/ventas")).toEqual(["farmacia", "plataforma"]);
  });

  it("la pestaña del panel renueva su propia cookie", async () => {
    const fetch = red();
    await refreshSession("admin", "plataforma");
    expect(cuerpo(fetch)).toMatchObject({
      usuarioEsperado: "admin",
      sesion: "plataforma",
    });
  });

  it("la de farmacia renueva como siempre, sin el campo", async () => {
    const fetch = red();
    await refreshSession("cajero");
    expect(cuerpo(fetch)).not.toHaveProperty("sesion");
  });

  it("salir del panel cierra sólo la sesión del superadmin", async () => {
    let fetch = red();
    await logout("plataforma");
    expect(cuerpo(fetch)).toEqual({ sesion: "plataforma" });
    fetch = red();
    await logout();
    expect(cuerpo(fetch)).toEqual({});
  });
});
