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
import { ENCABEZADO_PLATAFORMA } from "./platform-token";
import { PlatformTokenService } from "./platform-token.service";
import { PLATFORM_VERIFICATION_OPTIONAL } from "./platform-verification-optional.decorator";

/**
 * Las rutas de plataforma no existen para nadie más: un anónimo o un usuario de farmacia
 * recibe la misma respuesta que en una ruta inexistente. La base se consulta en cada pedido,
 * así que revocar una cuenta corta el acceso al instante.
 *
 * Desde SISTEMA-94 el código no queda en la sesión (que comparten todas las
 * pestañas del navegador): cada pedido trae el token de plataforma de la
 * pestaña donde se ingresó, del mismo usuario y sesión del access token.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly jwtAccess: JwtAccessGuard,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly tokens: PlatformTokenService,
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
    const tokenId = await this.tokens.validar(
      request.headers[ENCABEZADO_PLATAFORMA],
      { userId: sub, sessionId },
      { ip: request.ip, userAgent: request.headers["user-agent"] },
    );
    if (tokenId) request.plataforma = { tokenId };
    else
      throw new ForbiddenException({
        message: "Ingresá el código de tu aplicación para seguir.",
        error: "PLATFORM_VERIFICATION_REQUIRED",
      });
    return true;
  }
}
