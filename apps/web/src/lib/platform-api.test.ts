import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlatformPlans, PlatformApiError } from "./platform-api";

const respondWith = (status: number, body: object) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );

describe("errores del panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin conexión avisa en castellano, sin el texto del navegador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(getPlatformPlans("token")).rejects.toThrow(
      "No hubo respuesta del servidor. Revisá la conexión.",
    );
  });

  it("no muestra el texto interno de un error del servidor", async () => {
    respondWith(500, { message: "Internal server error" });

    const failure = await getPlatformPlans("token").catch(
      (cause: unknown) => cause,
    );

    expect(failure).toBeInstanceOf(PlatformApiError);
    expect((failure as PlatformApiError).status).toBe(500);
    expect((failure as PlatformApiError).message).toBe(
      "El servidor no pudo completar la operación.",
    );
  });

  it("muestra el motivo de un rechazo de la API", async () => {
    respondWith(409, { message: "Este pago ya estaba anulado." });

    await expect(getPlatformPlans("token")).rejects.toThrow(
      "Este pago ya estaba anulado.",
    );
  });
});
