import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Equals, IsInt, IsUUID, Max, Min } from "class-validator";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ArcaConnectionService } from "./arca-connection.service";
import { FiscalTrialService } from "./fiscal-trial.service";
class TrialDto {
  @IsUUID() requestId!: string;
  @IsInt() @Min(1) @Max(99999) point!: number;
  @Equals(true) confirmHomologation!: boolean;
}
@Controller("organizations/:organizationId/fiscal-testing")
@UseGuards(JwtAccessGuard)
export class FiscalTestingController {
  constructor(
    private readonly connection: ArcaConnectionService,
    private readonly trials: FiscalTrialService,
  ) {}
  @Post("connect") @Header("Cache-Control", "no-store") connect(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) org: string,
  ) {
    return this.connection.connect(req.auth!.sub, org);
  }
  @Get("trials") @Header("Cache-Control", "no-store") history(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) org: string,
  ) {
    return this.trials.history(req.auth!.sub, org);
  }
  @Post("trials") @Header("Cache-Control", "no-store") issue(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) org: string,
    @Body() input: TrialDto,
  ) {
    return this.trials.issue(req.auth!.sub, org, input.requestId, input.point);
  }
  @Post("trials/:id/reconcile") @Header("Cache-Control", "no-store") reconcile(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) org: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.trials.reconcile(req.auth!.sub, org, id);
  }
}
