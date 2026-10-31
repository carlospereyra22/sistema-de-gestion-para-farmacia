import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

import { EnvironmentService } from "../config/environment.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "./auth.types";

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
      throw new UnauthorizedException("Invalid email or password.");
    return this.createSession(user.id, user.email);
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        active: true,
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
      throw new UnauthorizedException("Refresh session is invalid or expired.");
    const parsedToken = this.parseRefreshToken(refreshToken);
    if (!parsedToken)
      throw new UnauthorizedException("Refresh session is invalid or expired.");
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: parsedToken.sessionId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { user: true },
    });
    if (!session || !(await verify(session.tokenHash, parsedToken.secret)))
      throw new UnauthorizedException("Refresh session is invalid or expired.");
    if (!session.user.active)
      throw new UnauthorizedException("User is inactive.");
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
