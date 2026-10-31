import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.params.organizationId;
    const branchId = request.params.branchId;
    const userId = request.auth?.sub;
    if (
      !userId ||
      typeof organizationId !== "string" ||
      typeof branchId !== "string"
    )
      throw new ForbiddenException("Branch access is required.");
    const assignment = await this.prisma.userBranch.findFirst({
      where: {
        userId,
        branchId,
        branch: { organizationId, active: true },
      },
      select: { userId: true },
    });
    if (!assignment)
      throw new ForbiddenException("You do not have access to this branch.");
    return true;
  }
}
