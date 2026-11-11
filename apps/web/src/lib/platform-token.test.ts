import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlatformPlans,
  olvidarTokenDePlataforma,
  salirDelPanel,
  salirDeSoporte,
  tieneTokenDePlataforma,
  verifyPlatformCode,
} from "./platform-api";

/** Almacenamiento espía: el token nunca tiene que llegar acá. */
function almacenEspia() {
  const escrituras: string[] = [];
  const almacen = {
    getItem: () => null,
    setItem: (clave: string, valor: string) => {
      escrituras.push(`${clave}=${valor}`);
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
  return { almacen, escrituras };
}

const responder = (...respuestas: [number, object | undefined][]) => {
  const red = vi.fn();
  for (const [status, body] of respuestas)
    red.mockResolvedValueOnce(
      new Response(body ? JSON.stringify(body) : null, { status }),
    );
  vi.stubGlobal("fetch", red);
  return red;
};

const encabezados = (red: ReturnType<typeof vi.fn>, llamada: number) =>
  (red.mock.calls[llamada]![1] as RequestInit).headers as Record<
    string,
    string
  >;

describe("token de plataforma de la pestaña (SISTEMA-94)", () => {
  afterEach(() => {
    olvidarTokenDePlataforma();
    vi.unstubAllGlobals();
  });

  it("vive sólo en memoria y se manda en el encabezado X-Plataforma", async () => {
    const local = almacenEspia();
    const sesion = almacenEspia();
    vi.stubGlobal("localStorage", local.almacen);
    vi.stubGlobal("sessionStorage", sesion.almacen);
    const red = responder(
      [200, { verified: true, token: "id.secreto" }],
      [200, []],
    );
    vi.stubGlobal("fetch", red);
    vi.stubGlobal("localStorage", local.almacen);
    vi.stubGlobal("sessionStorage", sesion.almacen);

    await expect(verifyPlatformCode("acceso", "123456")).resolves.toEqual({
      verified: true,
    });
    expect(tieneTokenDePlataforma()).toBe(true);
    await getPlatformPlans("acceso");

    expect(encabezados(red, 0)["X-Plataforma"]).toBeUndefined();
    expect(encabezados(red, 1)["X-Plataforma"]).toBe("id.secreto");
    expect([...local.escrituras, ...sesion.escrituras].join()).not.toContain(
      "secreto",
    );
  });

  it("al vencer se olvida y el panel vuelve a pedir el código", async () => {
    responder(
      [200, { verified: true, token: "id.secreto" }],
      [
        403,
        {
          code: "PLATFORM_VERIFICATION_REQUIRED",
          message: "Ingresá el código de tu aplicación para seguir.",
        },
      ],
    );
    await verifyPlatformCode("acceso", "123456");
    await expect(getPlatformPlans("acceso")).rejects.toMatchObject({
      code: "PLATFORM_VERIFICATION_REQUIRED",
    });
    expect(tieneTokenDePlataforma()).toBe(false);
  });

  it("Salir del panel lo revoca en el servidor y lo borra", async () => {
    const red = responder(
      [200, { verified: true, token: "id.secreto" }],
      [204, undefined],
    );
    await verifyPlatformCode("acceso", "123456");
    await salirDelPanel("acceso");
    expect(String(red.mock.calls[1]![0])).toMatch(/\/platform\/token\/salir$/);
    expect(encabezados(red, 1)["X-Plataforma"]).toBe("id.secreto");
    expect(tieneTokenDePlataforma()).toBe(false);
  });

  it("aunque el servidor no responda, Salir del panel lo borra igual", async () => {
    responder([200, { verified: true, token: "id.secreto" }]);
    await verifyPlatformCode("acceso", "123456");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("red")));
    await expect(salirDelPanel("acceso")).rejects.toThrow();
    expect(tieneTokenDePlataforma()).toBe(false);
  });

  it("volver del soporte manda el token para cerrar la sesión de soporte", async () => {
    const red = responder(
      [200, { verified: true, token: "id.secreto" }],
      [204, undefined],
    );
    await verifyPlatformCode("acceso", "123456");
    await salirDeSoporte("acceso", "sesion-soporte");
    expect(encabezados(red, 1)["X-Plataforma"]).toBe("id.secreto");
  });
});
