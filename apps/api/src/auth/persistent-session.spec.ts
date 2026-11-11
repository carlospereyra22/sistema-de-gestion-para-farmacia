import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import type { EnvironmentService } from "../config/environment.service";
jest.mock("@node-rs/argon2", () => ({
  verify: jest.fn(async () => true),
  hash: jest.fn(async () => "hash"),
}));
describe("persistent sessions", () => {
  const token = "123e4567-e89b-42d3-a456-426614174000.secret";
  function setup(session: object | null) {
    const sessions = {
      findFirst: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({}),
    };
    const signAsync = jest.fn().mockResolvedValue("access");
    return {
      sessions,
      signAsync,
      service: new AuthService(
        { authSession: sessions } as unknown as PrismaService,
        { signAsync } as unknown as JwtService,
        {} as EnvironmentService,
      ),
    };
  }
  it("renews access without rotating or revoking the shared browser session", async () => {
    const { service, sessions, signAsync } = setup({
      id: "session",
      tokenHash: "hash",
      user: { id: "user", email: "user@example.com", active: true },
    });
    expect(await service.refresh(token)).toEqual({
      accessToken: "access",
      refreshToken: token,
    });
    expect(sessions.update).toHaveBeenCalledWith({
      where: { id: "session" },
      data: { expiresAt: null },
    });
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session" }),
      { expiresIn: "15m" },
    );
  });
  describe("pestaña que espera un usuario (SISTEMA-92)", () => {
    const sesion = {
      id: "session",
      tokenHash: "hash",
      user: { id: "user", email: "duena@example.com", active: true },
    };
    it("con el mismo usuario renueva como siempre", async () => {
      const { service } = setup(sesion);
      expect(await service.refresh(token, "user")).toEqual({
        accessToken: "access",
        refreshToken: token,
      });
    });
    it("con otro usuario responde 409 sin token y sin tocar la sesión", async () => {
      const { service, sessions, signAsync } = setup(sesion);
      const error = await service
        .refresh(token, "cajero")
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: "SESION_DE_OTRO_USUARIO",
        details: { email: "duena@example.com" },
      });
      expect(signAsync).not.toHaveBeenCalled();
      expect(sessions.update).not.toHaveBeenCalled();
    });
    it("una cookie inválida sigue siendo 401 aunque espere un usuario", async () => {
      const { service } = setup(null);
      await expect(service.refresh(token, "user")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
  it("still rejects missing or revoked sessions", async () => {
    const { service, sessions } = setup(null);
    await expect(service.refresh(token)).rejects.toThrow();
    expect(sessions.update).not.toHaveBeenCalled();
  });
  it("logout still revokes the persistent session", async () => {
    const { service, sessions } = setup({ id: "session", tokenHash: "hash" });
    await service.logout(token);
    expect(sessions.update).toHaveBeenCalledWith({
      where: { id: "session" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
