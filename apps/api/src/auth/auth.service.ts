import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

import { EnvironmentService } from "../config/environment.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "./auth.types";
import { clavePublicaValida } from "../sales/firma-venta";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly environment: EnvironmentService,
  ) {}

  async login(email: string, password: string) {
    if (!this.environment.jwtAccessSecret)
      throw new UnauthorizedException("Authentication is not configured.");
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.active || !(await verify(user.passwordHash, password)))
      throw new UnauthorizedException("Email o contraseña incorrectos.");
    return this.createSession(user.id, user.email);
  }

  /**
   * Guarda la clave con la que esta PC firma las ventas sin conexión del
   * usuario (SISTEMA-66). Se registra al entrar con conexión; volver a
   * registrarla la reemplaza.
   */
  async registerOfflineKey(
    userId: string,
    deviceId: string,
    publicKey: string,
  ) {
    if (!clavePublicaValida(publicKey))
      throw new BadRequestException("La clave de la PC no es válida.");
    await this.prisma.offlineDeviceKey.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, publicKey },
      update: { publicKey },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        active: true,
        mustChangePassword: true,
        platformAdmin: { select: { active: true } },
        organizations: {
          include: {
            organization: true,
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
        branches: { include: { branch: true } },
      },
    });
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken)
      throw new UnauthorizedException(
        "Tu sesión venció. Volvé a iniciar sesión.",
      );
    const parsedToken = this.parseRefreshToken(refreshToken);
    if (!parsedToken)
      throw new UnauthorizedException(
        "Tu sesión venció. Volvé a iniciar sesión.",
      );
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: parsedToken.sessionId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { user: true },
    });
    if (!session || !(await verify(session.tokenHash, parsedToken.secret)))
      throw new UnauthorizedException(
        "Tu sesión venció. Volvé a iniciar sesión.",
      );
    if (!session.user.active)
      throw new UnauthorizedException("El usuario está desactivado.");
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: null },
    });
    return {
      accessToken: await this.jwt.signAsync(
        {
          sub: session.user.id,
          sessionId: session.id,
          email: session.user.email,
        },
        { expiresIn: "15m" },
      ),
      refreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const parsedToken = this.parseRefreshToken(refreshToken);
    if (!parsedToken) return;
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: parsedToken.sessionId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, tokenHash: true },
    });
    if (!session || !(await verify(session.tokenHash, parsedToken.secret)))
      return;
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * El usuario cambia su propia contraseña. Conserva la sesión desde la que lo hace y
   * cierra las demás. La clave incorrecta responde 400: un 401 cerraría la sesión en la web.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        active: true,
        passwordHash: true,
        organizations: { select: { organizationId: true } },
      },
    });
    if (!user?.active || !(await verify(user.passwordHash, currentPassword)))
      throw new BadRequestException("La contraseña actual no es correcta.");
    if (await verify(user.passwordHash, newPassword))
      throw new BadRequestException(
        "La contraseña nueva tiene que ser distinta de la actual.",
      );
    const passwordHash = await hash(newPassword);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.createMany({
        data: user.organizations.map(({ organizationId }) => ({
          organizationId,
          actorId: userId,
          entityType: "USER",
          entityId: userId,
          action: "PASSWORD_CHANGED_BY_USER",
          after: { revokedSessions: revoked.count },
        })),
      });
      return { revokedSessions: revoked.count };
    });
  }

  private async createSession(userId: string, email: string) {
    const refreshSecret = randomBytes(48).toString("base64url");
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: await hash(refreshSecret),
        expiresAt: null,
      },
    });
    const payload: AccessTokenPayload = {
      sub: userId,
      sessionId: session.id,
      email,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: "15m" }),
      refreshToken: `${session.id}.${refreshSecret}`,
    };
  }

  private parseRefreshToken(
    token: string,
  ): { sessionId: string; secret: string } | undefined {
    const [sessionId, secret, extra] = token.split(".");
    return sessionId && secret && !extra ? { sessionId, secret } : undefined;
  }
}
