import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PLATFORM_VERIFICATION_OPTIONAL } from "./platform-verification-optional.decorator";

const VERIFICATION_MS = 12 * 60 * 60 * 1000;

export function isPlatformSessionVerified(
  verifiedAt: Date | null | undefined,
  now: Date,
) {
  return !!verifiedAt && now.getTime() - verifiedAt.getTime() < VERIFICATION_MS;
}

/**
 * Las rutas de plataforma no existen para nadie más: un anónimo o un usuario de farmacia
 * recibe la misma respuesta que en una ruta inexistente. La base se consulta en cada pedido,
 * así que revocar una cuenta corta el acceso al instante.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly jwtAccess: JwtAccessGuard,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hidden = () =>
      new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`);
    try {
      await this.jwtAccess.canActivate(context);
    } catch {
      throw hidden();
    }
    const { sub, sessionId } = request.auth!;
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { userId: sub, active: true },
      select: { id: true },
    });
    if (!admin) throw hidden();
    const optional = this.reflector.getAllAndOverride<boolean | undefined>(
      PLATFORM_VERIFICATION_OPTIONAL,
      [context.getHandler(), context.getClass()],
    );
    if (optional) return true;
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: { platformVerifiedAt: true },
    });
    if (!isPlatformSessionVerified(session?.platformVerifiedAt, new Date()))
      throw new ForbiddenException({
        message: "Ingresá el código de tu aplicación para seguir.",
        error: "PLATFORM_VERIFICATION_REQUIRED",
      });
    return true;
  }
}
