import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformBillingService } from "./platform-billing.service";
import {
  commercialToday,
  coveredUntil,
  nextCut,
  resolveSubscriptionAccess,
} from "./subscription-access";
import { AlwaysAvailable } from "./subscription-gate";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lo que la farmacia ve de su abono. El saldo, solo el dueño. */
@Injectable()
export class SubscriptionStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
  ) {}

  async status(actorId: string, organizationId: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      select: {
        active: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!membership?.active)
      throw new ForbiddenException("No pertenecés a esta farmacia.");
    const isOwner = membership.roles.some(({ role }) => role.code === "OWNER");
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subscription || subscription.exempt)
      return {
        stage: "EXEMPT" as const,
        access: "FULL" as const,
        daysOverdue: 0,
        coveredUntil: null,
        daysLeft: null,
        nextCut: null,
        isOwner,
        balanceMinor: null,
      };
    const now = new Date();
    const result = resolveSubscriptionAccess(subscription, now);
    const until = coveredUntil(subscription);
    const today = commercialToday(now);
    return {
      ...result,
      coveredUntil: until,
      daysLeft:
        until && until >= today
          ? Math.round((Date.parse(until) - Date.parse(today)) / DAY_MS)
          : null,
      nextCut: nextCut(result, now),
      isOwner,
      balanceMinor: isOwner
        ? (await this.billing.ledger(organizationId)).balanceMinor
        : null,
    };
  }
}

@Controller("organizations/:organizationId/subscription")
@UseGuards(JwtAccessGuard)
export class SubscriptionStatusController {
  constructor(private readonly subscriptions: SubscriptionStatusService) {}

  @Get("status")
  @AlwaysAvailable()
  status(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.subscriptions.status(request.auth!.sub, organizationId);
  }
}
