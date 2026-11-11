import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import type { EnvironmentService } from "../config/environment.service";
import { GRACIA_ROTACION_MS, claveSiguiente } from "./sesion-vigencia";

// Hash de mentira y comprobable: "h:<secreto>".
jest.mock("@node-rs/argon2", () => ({
  verify: jest.fn(
    async (hash: string, secret: string) => hash === `h:${secret}`,
  ),
  hash: jest.fn(async (secret: string) => `h:${secret}`),
}));

/*
 * Sesión persistente (SISTEMA-93). Antes este test fijaba a propósito que la
 * renovación NO rotaba la clave y la sesión no vencía nunca: quien copiaba la
 * cookie entraba para siempre. Ahora la clave rota en cada renovación (la
 * anterior vale 2 minutos, por varias pestañas) y la sesión vence si no se usa
 * durante el plazo de inactividad (7 días por defecto, nunca menos de 72 h,
 * para no romper las 24 h sin internet). Una clave vieja fuera del margen
 * revoca la sesión y se audita.
 */
describe("sesión persistente con rotación y vencimiento por inactividad", () => {
  const ID = "123e4567-e89b-42d3-a456-426614174000";
  const DIA = 86_400_000;
  const clave = (secreto: string) => `${ID}.${secreto}`;

  function setup(session: Record<string, unknown> | null, dias?: number) {
    const authSession = {
      findFirst: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({}),
    };
    const auditLog = { createMany: jest.fn().mockResolvedValue({}) };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      authSession,
      auditLog,
      userOrganization: {
        findMany: jest.fn().mockResolvedValue([{ organizationId: "org" }]),
      },
    };
    const signAsync = jest.fn().mockResolvedValue("access");
    const prisma = {
      authSession,
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    return {
      authSession,
      auditLog,
      signAsync,
      service: new AuthService(
        prisma as unknown as PrismaService,
        { signAsync } as unknown as JwtService,
        { sessionInactivityDays: dias ?? 7 } as EnvironmentService,
      ),
    };
  }

  const sesion = (extra: Record<string, unknown> = {}) => ({
    id: ID,
    userId: "user",
    tokenHash: "h:actual",
    previousTokenHash: "h:anterior",
    previousTokenValidUntil: new Date(Date.now() + 60_000),
    retiredTokenHashes: ["h:retirada"],
    lastUsedAt: new Date(),
    user: { id: "user", email: "duena@example.com", active: true },
    ...extra,
  });

  it("con la clave actual rota: clave nueva, la anterior vale un rato", async () => {
    const { service, authSession } = setup(sesion());
    const antes = Date.now();
    const result = await service.refresh(clave("actual"));
    expect(result.accessToken).toBe("access");
    expect(result.refreshToken).toMatch(new RegExp(`^${ID}\\.`));
    expect(result.refreshToken).not.toBe(clave("actual"));
    const { data } = authSession.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(data.tokenHash).toBe(`h:${result.refreshToken!.split(".")[1]}`);
    expect(data.previousTokenHash).toBe("h:actual");
    expect(data.retiredTokenHashes).toEqual(["h:anterior", "h:retirada"]);
    const vale = (data.previousTokenValidUntil as Date).getTime() - antes;
    expect(vale).toBeGreaterThanOrEqual(GRACIA_ROTACION_MS - 1000);
    expect(vale).toBeLessThanOrEqual(GRACIA_ROTACION_MS + 1000);
    expect(data.lastUsedAt).toBeInstanceOf(Date);
  });

  it("con la anterior dentro del margen reenvía la misma clave nueva (SISTEMA-101)", async () => {
    const siguiente = claveSiguiente("", ID, "anterior");
    const { service, authSession } = setup(
      sesion({ tokenHash: `h:${siguiente}` }),
    );
    const result = await service.refresh(clave("anterior"));
    expect(result.refreshToken).toBe(clave(siguiente));
    const { data } = authSession.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty("tokenHash");
  });

  it("la clave nueva sale de la anterior con el secreto del servidor", () => {
    expect(claveSiguiente("s1", ID, "x")).toBe(claveSiguiente("s1", ID, "x"));
    expect(claveSiguiente("s1", ID, "x")).not.toBe(
      claveSiguiente("s2", ID, "x"),
    );
    expect(claveSiguiente("s1", ID, "x")).not.toBe(
      claveSiguiente("s1", ID, "y"),
    );
  });

  it("con la anterior dentro del margen renueva sin rotar ni cambiar la cookie", async () => {
    const { service, authSession } = setup(sesion());
    const result = await service.refresh(clave("anterior"));
    expect(result).toEqual({ accessToken: "access", persistente: true });
    const { data } = authSession.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(data).not.toHaveProperty("tokenHash");
    expect(data.lastUsedAt).toBeInstanceOf(Date);
  });

  it.each([
    [
      "la anterior fuera del margen",
      "anterior",
      { previousTokenValidUntil: new Date(Date.now() - 1000) },
    ],
    ["una clave ya retirada", "retirada", {}],
  ])(
    "con %s revoca la sesión y lo audita (cookie copiada)",
    async (_caso, secreto, extra) => {
      const { service, authSession, auditLog, signAsync } = setup(
        sesion(extra),
      );
      await expect(service.refresh(clave(secreto))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authSession.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { revokedAt: expect.any(Date) },
      });
      const auditoria = auditLog.createMany.mock.calls[0]![0] as {
        data: { action: string }[];
      };
      expect(auditoria.data[0]!.action).toBe("SESSION_REUSE_DETECTED");
      expect(JSON.stringify(auditoria)).not.toContain(secreto);
      expect(signAsync).not.toHaveBeenCalled();
    },
  );

  it("una clave desconocida es 401 sin revocar (no prueba que la copiaron)", async () => {
    const { service, authSession } = setup(sesion());
    await expect(service.refresh(clave("otra"))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authSession.update).not.toHaveBeenCalled();
  });

  it("vence por inactividad y no antes", async () => {
    const vieja = setup(sesion({ lastUsedAt: new Date(Date.now() - 8 * DIA) }));
    await expect(vieja.service.refresh(clave("actual"))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(vieja.authSession.update).not.toHaveBeenCalled();
    // 24 h sin internet (o 6 días sin usarla) renueva sin pedir contraseña.
    const usada = setup(sesion({ lastUsedAt: new Date(Date.now() - 6 * DIA) }));
    await expect(
      usada.service.refresh(clave("actual")),
    ).resolves.toHaveProperty("refreshToken");
  });

  it("nunca vence antes de 72 h aunque se configure menos", async () => {
    const { service } = setup(
      sesion({ lastUsedAt: new Date(Date.now() - 2.5 * DIA) }),
      1,
    );
    expect(service.inactividadMs).toBe(3 * DIA);
    await expect(service.refresh(clave("actual"))).resolves.toHaveProperty(
      "accessToken",
    );
  });

  it("rechaza sesiones revocadas o cookies con otra forma", async () => {
    const { service } = setup(null);
    await expect(service.refresh(clave("actual"))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.refresh("no-es.una.cookie")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.refresh("no-uuid.secreto")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe("pestaña que espera un usuario (SISTEMA-92)", () => {
    it("con el mismo usuario renueva como siempre", async () => {
      const { service } = setup(sesion());
      await expect(
        service.refresh(clave("actual"), "user"),
      ).resolves.toHaveProperty("accessToken", "access");
    });
    it("con otro usuario responde 409 sin token y sin tocar la sesión", async () => {
      const { service, authSession, signAsync } = setup(sesion());
      const error = await service
        .refresh(clave("actual"), "cajero")
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: "SESION_DE_OTRO_USUARIO",
        details: { email: "duena@example.com" },
      });
      expect(signAsync).not.toHaveBeenCalled();
      expect(authSession.update).not.toHaveBeenCalled();
    });
  });

  it("logout revoca con la clave actual o con la anterior dentro del margen", async () => {
    for (const secreto of ["actual", "anterior"]) {
      const { service, authSession } = setup(sesion());
      await service.logout(clave(secreto));
      expect(authSession.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { revokedAt: expect.any(Date) },
      });
    }
    const { service, authSession } = setup(sesion());
    await service.logout(clave("otra"));
    expect(authSession.update).not.toHaveBeenCalled();
  });
});
