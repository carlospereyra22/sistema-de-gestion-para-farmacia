import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { PrismaService } from "../src/prisma/prisma.service";
import { startHttpApp, type HttpApp } from "./support/http-app";

/** La cookie de sesión de una respuesta ("gestion_refresh=..."), si vino. */
const cookieDe = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0];

/**
 * Sesión de otro usuario en otra pestaña (SISTEMA-92), por HTTP como el
 * navegador: la cookie del navegador ya es de la dueña y la pestaña del cajero
 * pide renovar diciendo que espera al cajero.
 */
describe("renovación con usuario esperado (HTTP, esquema aislado)", () => {
  let api: HttpApp;
  let db: PrismaService;
  let base: string;
  const clave = "una-clave-de-prueba-larga";

  beforeAll(async () => {
    api = await startHttpApp("sesion_otro");
    db = api.db;
    base = `${api.base}/auth`;
  }, 100000);
  afterAll(() => api?.close());

  async function entrar(email: string) {
    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: clave }),
    });
    expect(response.status).toBe(200);
    return cookieDe(response)!;
  }

  const renovar = (cookie: string, usuarioEsperado?: string) =>
    fetch(`${base}/refresh`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(usuarioEsperado ? { usuarioEsperado } : {}),
    });

  it("no le entrega a la pestaña del cajero el token de la dueña", async () => {
    const passwordHash = await hash(clave);
    const [cajero, duena] = await Promise.all(
      ["cajero", "duena"].map((nombre) =>
        db.user.create({
          data: {
            email: `${nombre}-${randomUUID()}@example.invalid`,
            passwordHash,
          },
        }),
      ),
    );
    await entrar(cajero!.email);
    // La dueña entra en otra pestaña: la cookie del navegador pasa a ser suya.
    let cookie = await entrar(duena!.email);

    const pausada = await renovar(cookie, cajero!.id);
    expect(pausada.status).toBe(409);
    expect(pausada.headers.get("set-cookie")).toBeNull();
    expect(await pausada.json()).toMatchObject({
      code: "SESION_DE_OTRO_USUARIO",
      details: { email: duena!.email },
    });
    expect(
      await db.authSession.count({
        where: { userId: duena!.id, revokedAt: { not: null } },
      }),
    ).toBe(0);

    // La pestaña de la dueña sigue andando, con o sin usuario esperado. Cada
    // renovación rota la clave (SISTEMA-93): se sigue con la cookie nueva.
    const propia = await renovar(cookie, duena!.id);
    expect(propia.status).toBe(200);
    expect(await propia.json()).toHaveProperty("accessToken");
    cookie = cookieDe(propia)!;
    const sinCampo = await renovar(cookie);
    expect(sinCampo.status).toBe(200);
    cookie = cookieDe(sinCampo)!;
    // Una web vieja renueva sin cuerpo: sigue andando como antes.
    expect(
      (
        await fetch(`${base}/refresh`, {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200);

    // Una cookie inválida sigue siendo 401 y un id mal formado, 400.
    expect((await renovar("gestion_refresh=no-vale", duena!.id)).status).toBe(
      401,
    );
    expect(
      (
        await fetch(`${base}/refresh`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ usuarioEsperado: "cajero" }),
        })
      ).status,
    ).toBe(400);
  });
});
