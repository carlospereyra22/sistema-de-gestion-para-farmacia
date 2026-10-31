import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { TransfersService } from "./transfers.service";
class ItemDto {
  @IsString() lotId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
class CreateDto {
  @IsString() destinationBranchId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items!: ItemDto[];
}
@Controller("organizations/:organizationId/branches/:branchId/transfers")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.transfers.list(req.auth!.sub, organizationId, branchId);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CreateDto,
  ) {
    return this.transfers.create(req.auth!.sub, organizationId, branchId, body);
  }
  @Post(":id/dispatch") dispatch(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("id") id: string,
  ) {
    return this.transfers.dispatch(req.auth!.sub, organizationId, branchId, id);
  }
  @Post(":id/receive") receive(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("id") id: string,
  ) {
    return this.transfers.receive(req.auth!.sub, organizationId, branchId, id);
  }
}
