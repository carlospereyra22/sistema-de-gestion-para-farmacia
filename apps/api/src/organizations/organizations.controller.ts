import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { BranchDto, BranchStatusDto } from "./branch.dto";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { OrganizationsService } from "./organizations.service";
import { TicketHeaderDto } from "./ticket-header";
import { FiscalProfileDto } from "./fiscal-profile";
import { FiscalPointDto, FiscalPointStatusDto } from "./fiscal-point.dto";

@Controller("organizations/:organizationId")
@UseGuards(JwtAccessGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("fiscal-setup") fiscalSetup(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.fiscalSetup(request.auth!.sub, id);
  }
  @Post("fiscal-points") createFiscalPoint(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: FiscalPointDto,
  ) {
    return this.organizations.createFiscalPoint(request.auth!.sub, id, body);
  }
  @Patch("fiscal-points/:pointId") changeFiscalPointStatus(
    @Param("organizationId") id: string,
    @Param("pointId") pointId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: FiscalPointStatusDto,
  ) {
    return this.organizations.changeFiscalPointStatus(
      request.auth!.sub,
      id,
      pointId,
      body.active,
    );
  }

  @Get("fiscal-profile") fiscalProfile(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.fiscalProfile(request.auth!.sub, id);
  }
  @Patch("fiscal-profile") updateFiscalProfile(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: FiscalProfileDto,
  ) {
    return this.organizations.updateFiscalProfile(request.auth!.sub, id, body);
  }

  @Get("ticket-header")
  ticketHeader(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.ticketHeader(request.auth!.sub, organizationId);
  }
  @Patch("ticket-header")
  updateTicketHeader(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: TicketHeaderDto,
  ) {
    return this.organizations.updateTicketHeader(
      request.auth!.sub,
      organizationId,
      body,
    );
  }

  @Get("branches")
  listBranches(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.listBranches(request.auth!.sub, organizationId);
  }

  @Post("branches")
  createBranch(
    @Param("organizationId") organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: BranchDto,
  ) {
    return this.organizations.createBranch(
      request.auth!.sub,
      organizationId,
      body.name,
      body.code,
      body,
    );
  }

  @Patch("branches/:branchId")
  updateBranch(
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: BranchDto,
  ) {
    return this.organizations.updateBranch(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
  }

  @Patch("branches/:branchId/status")
  statusBranch(
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: BranchStatusDto,
  ) {
    return this.organizations.changeBranchStatus(
      request.auth!.sub,
      organizationId,
      branchId,
      body.active,
    );
  }

  @Delete("branches/:branchId")
  deleteBranch(
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.changeBranchStatus(
      request.auth!.sub,
      organizationId,
      branchId,
      false,
      true,
    );
  }
}
