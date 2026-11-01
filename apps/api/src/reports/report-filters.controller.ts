import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { ReportAccessService } from "./report-access.service";
import { ReportFiltersQuery } from "./report-filters.dto";
import { ReportOverviewService } from "./report-overview.service";

/**
 * Reportes a nivel organizacion: pueden abarcar varias sucursales, por eso no usan
 * BranchAccessGuard; ReportAccessService valida cada sucursal pedida.
 */
@Controller("organizations/:organizationId/reports")
@UseGuards(JwtAccessGuard)
export class ReportFiltersController {
  constructor(
    private readonly access: ReportAccessService,
    private readonly overviewReport: ReportOverviewService,
  ) {}

  @Get("filter-options") filterOptions(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.access.filterOptions(req.auth!.sub, organizationId);
  }

  @Get("overview") overview(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.overviewReport.overview(req.auth!.sub, organizationId, query);
  }
}
