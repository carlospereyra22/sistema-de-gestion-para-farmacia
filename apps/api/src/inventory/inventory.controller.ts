import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
  ValidateIf,
  Matches,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { InventoryService } from "./inventory.service";

class ReceiveStockDto {
  @IsString() productId!: string;
  @IsString() @MinLength(1) lotNumber!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostMinor!: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}

class AdjustStockDto {
  @IsString() lotId!: string;
  @Type(() => Number) @IsInt() quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
}
class EditLotDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,14}$/)
  unitCostMinor?: string;
  @IsString() @MinLength(1) @MaxLength(100) number!: string;
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresAt!: string | null;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
class SupplierReturnDto {
  @IsString() supplierId!: string;
  @IsString() lotId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
}

@Controller("organizations/:organizationId/branches/:branchId/inventory")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Patch("lots/:lotId") editLot(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("lotId", ParseUUIDPipe) lotId: string,
    @Body() body: EditLotDto,
  ) {
    return this.inventory.editLot(
      request.auth!.sub,
      organizationId,
      branchId,
      lotId,
      body,
    );
  }

  @Get("stock")
  stock(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.stock(request.auth!.sub, organizationId, branchId);
  }

  @Get("expiring")
  expiring(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.expiring(request.auth!.sub, organizationId, branchId);
  }

  @Get("history")
  history(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.history(request.auth!.sub, organizationId, branchId);
  }

  @Post("receipts")
  receive(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: ReceiveStockDto,
  ) {
    return this.inventory.receive(request.auth!.sub, {
      ...body,
      organizationId,
      branchId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }

  @Post("adjustments")
  adjust(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: AdjustStockDto,
  ) {
    return this.inventory.adjust(request.auth!.sub, {
      ...body,
      organizationId,
      branchId,
    });
  }

  @Post("supplier-returns")
  supplierReturn(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SupplierReturnDto,
  ) {
    return this.inventory.supplierReturn(request.auth!.sub, {
      ...body,
      organizationId,
      branchId,
    });
  }
}
