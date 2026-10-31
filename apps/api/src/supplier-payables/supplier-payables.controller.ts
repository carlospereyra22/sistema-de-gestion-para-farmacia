import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  NewPayableDto,
  PayableQueryDto,
  PaySupplierDto,
  VoidSupplierPaymentDto,
} from "./supplier-payables.dto";
import { SupplierPayablesService } from "./supplier-payables.service";
@Controller(
  "organizations/:organizationId/branches/:branchId/supplier-payables",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class SupplierPayablesController {
  constructor(private readonly service: SupplierPayablesService) {}
  @Post(":id/payments") pay(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PaySupplierDto,
  ) {
    return this.service.pay(req.auth!.sub, org, branch, id, body);
  }
  @Post(":id/payments/:paymentId/void") voidPayment(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @Body() body: VoidSupplierPaymentDto,
  ) {
    return this.service.voidPayment(
      req.auth!.sub,
      org,
      branch,
      id,
      paymentId,
      body.reason,
    );
  }
  @Get("options") options(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.service.options(req.auth!.sub, org, branch);
  }
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Query()
    query: PayableQueryDto,
  ) {
    return this.service.list(req.auth!.sub, org, branch, query);
  }
  @Get(":id") detail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(req.auth!.sub, org, branch, id);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: NewPayableDto,
  ) {
    return this.service.create(req.auth!.sub, org, branch, body);
  }
}
