import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma/prisma.service";
import { ALLOW_PENDING_PASSWORD_CHANGE } from "./allow-pending-password-change.decorator";
import type { AccessTokenPayload, AuthenticatedRequest } from "./auth.types";

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Access token is required.");

    let mustChangePassword: boolean;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { user: { select: { mustChangePassword: true } } },
      });
      if (!session)
        throw new UnauthorizedException("Session is invalid or expired.");
      request.auth = payload;
      // El soporte entra como el usuario sin tener que cambiarle la clave.
      mustChangePassword = !payload.soporte && session.user.mustChangePassword;
    } catch {
      throw new UnauthorizedException("Access token is invalid or expired.");
    }
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PENDING_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()],
    );
    if (mustChangePassword && !allowed)
      throw new ForbiddenException({
        message: "Cambiá tu contraseña para seguir usando el sistema.",
        error: "PASSWORD_CHANGE_REQUIRED",
      });
    return true;
  }
}
