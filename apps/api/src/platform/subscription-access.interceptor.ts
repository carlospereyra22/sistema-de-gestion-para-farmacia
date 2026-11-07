import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Observable } from "rxjs";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { resolveSubscriptionAccess } from "./subscription-access";
import {
  SUBSCRIPTION_RULE,
  subscriptionDenied,
  subscriptionRestriction,
  type SubscriptionRule,
} from "./subscription-gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aplica el estado comercial de la farmacia a toda ruta con `:organizationId`. Corre
 * después de los guards, así que la sesión ya está validada.
 *
 * Ante la duda deja pasar: sin suscripción, para quien no es de la farmacia (recibe su
 * error de siempre, sin enterarse del estado) y si el chequeo falla. Un error nuestro
 * nunca puede cortar a una farmacia que pagó.
 */
@Injectable()
export class SubscriptionAccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SubscriptionAccessInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId: unknown = request.params?.organizationId;
    const actorId = request.auth?.sub;
    if (
      !actorId ||
      typeof organizationId !== "string" ||
      !UUID.test(organizationId)
    )
      return next.handle();
    const rule = this.reflector.getAllAndOverride<SubscriptionRule | undefined>(
      SUBSCRIPTION_RULE,
      [context.getHandler(), context.getClass()],
    );
    let denial: HttpException | null = null;
    try {
      denial = await this.check(organizationId, actorId, request.method, rule);
    } catch (cause) {
      this.logger.error(
        "No se pudo comprobar la suscripción; se deja pasar.",
        cause instanceof Error ? cause.stack : undefined,
      );
    }
    if (denial) throw denial;
    return next.handle();
  }

  private async check(
    organizationId: string,
    actorId: string,
    method: string,
    rule: SubscriptionRule | undefined,
  ) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: {
        exempt: true,
        suspendedAt: true,
        cancelledAt: true,
        trialEndsAt: true,
        paidThrough: true,
        extendedUntil: true,
      },
    });
    if (!subscription) return null;
    const { access, stage } = resolveSubscriptionAccess(
      subscription,
      new Date(),
    );
    const restriction = subscriptionRestriction(access, method, rule);
    if (restriction === "NONE") return null;
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      select: {
        active: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!membership?.active) return null;
    if (
      restriction === "OWNER_ONLY" &&
      membership.roles.some(({ role }) => role.code === "OWNER")
    )
      return null;
    return subscriptionDenied(
      restriction === "READ_ONLY" ? "READ_ONLY" : "BLOCKED",
      stage,
    );
  }
}
