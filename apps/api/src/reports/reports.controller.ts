import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { ReportsService } from "./reports.service";
@Controller("organizations/:organizationId/branches/:branchId/reports")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("summary") summary(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.reports.summary(req.auth!.sub, organizationId, branchId);
  }
  @Get("detail") detail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.detail(
      req.auth!.sub,
      organizationId,
      branchId,
      from,
      to,
    );
  }
}
