import {
  PLATAFORMA_INACTIVIDAD_MS,
  PLATAFORMA_RENOVAR_CADA_MS,
  estadoDelToken,
  hashDelSecreto,
  leerTokenDePlataforma,
  nuevoSecreto,
  type TokenGuardado,
} from "./platform-token";

describe("token de plataforma por pestaña (SISTEMA-94)", () => {
  const ahora = new Date("2026-11-11T15:00:00Z");
  const quien = { userId: "admin", sessionId: "sesion" };
  const token = (extra: Partial<TokenGuardado> = {}): TokenGuardado => ({
    userId: "admin",
    sessionId: "sesion",
    tokenHash: hashDelSecreto("secreto"),
    lastUsedAt: new Date(ahora.getTime() - 60_000),
    expiresAt: new Date(ahora.getTime() + 60 * 60_000),
    revokedAt: null,
    ...extra,
  });

  it("acepta el token de la misma pestaña, usuario y sesión", () => {
    expect(estadoDelToken(token(), quien, "secreto", ahora)).toEqual({
      valido: true,
      renovar: false,
    });
  });

  it("pide renovar el uso cada pocos minutos", () => {
    const usado = new Date(ahora.getTime() - PLATAFORMA_RENOVAR_CADA_MS);
    expect(
      estadoDelToken(token({ lastUsedAt: usado }), quien, "secreto", ahora),
    ).toEqual({ valido: true, renovar: true });
  });

  it.each([
    ["de otra sesión", token({ sessionId: "otra" }), "secreto", "otro"],
    ["de otro usuario", token({ userId: "otro" }), "secreto", "otro"],
    ["con otro secreto", token(), "inventado", "secreto"],
    ["revocado", token({ revokedAt: ahora }), "secreto", "revocado"],
    ["vencido", token({ expiresAt: ahora }), "secreto", "vencido"],
    [
      "sin uso por más de 30 minutos",
      token({
        lastUsedAt: new Date(ahora.getTime() - PLATAFORMA_INACTIVIDAD_MS - 1),
      }),
      "secreto",
      "inactivo",
    ],
  ])("rechaza un token %s", (_caso, guardado, secreto, motivo) => {
    expect(estadoDelToken(guardado, quien, secreto, ahora)).toEqual({
      valido: false,
      motivo,
    });
  });

  it("lee sólo tokens con la forma <id>.<secreto>", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(leerTokenDePlataforma(`${id}.abc`)).toEqual({
      id,
      secreto: "abc",
    });
    expect(leerTokenDePlataforma(undefined)).toBeUndefined();
    expect(leerTokenDePlataforma(["a", "b"])).toBeUndefined();
    expect(leerTokenDePlataforma("no-uuid.abc")).toBeUndefined();
    expect(leerTokenDePlataforma(`${id}.a.b`)).toBeUndefined();
  });

  it("guarda sólo el hash del secreto", () => {
    const { secreto, hash } = nuevoSecreto();
    expect(hash).toBe(hashDelSecreto(secreto));
    expect(hash).not.toContain(secreto);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
