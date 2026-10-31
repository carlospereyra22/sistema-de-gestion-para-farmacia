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
  ArrayMaxSize,
  IsUUID,
  MaxLength,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Matches,
  ValidateNested,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { PurchasesService } from "./purchases.service";

class LineDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostMinor!: number;
}
class CreateDto {
  @IsOptional() @IsUUID() clientOperationId?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() orderedAt?: string;
  @IsString() supplierId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  items!: LineDto[];
}
class ReceiptDto {
  @IsOptional() @IsUUID() operationId?: string;
  @IsString() itemId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsString() lotNumber!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
class ReceiptDebtDto {
  @IsString() @Matches(/^\d{1,14}$/) amountMinor!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueOn!: string | null;
}
class BatchDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptDebtDto)
  debt?: ReceiptDebtDto;
  @IsUUID() operationId!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiptDto)
  items!: ReceiptDto[];
}
class DirectLotDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsString() @MaxLength(100) lotNumber!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
class DirectDto extends CreateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptDebtDto)
  debt?: ReceiptDebtDto;
  @IsUUID() declare clientOperationId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DirectLotDto)
  receipts!: DirectLotDto[];
}
class ExpectedDto {
  @IsUUID() itemId!: string;
  @IsInt() @Min(0) pending!: number;
}
class CloseDto {
  @IsString() @MaxLength(300) reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpectedDto)
  expected!: ExpectedDto[];
}
@Controller("organizations/:organizationId/branches/:branchId/purchases")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}
  @Get(":purchaseId") detail(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("purchaseId") id: string,
  ) {
    return this.purchases.detail(
      request.auth!.sub,
      organizationId,
      branchId,
      id,
    );
  }
  @Post("direct") direct(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: DirectDto,
  ) {
    return this.purchases.direct(request.auth!.sub, organizationId, branchId, {
      ...body,
      receipts: body.receipts.map((line) => ({
        ...line,
        expiresAt: line.expiresAt ? new Date(line.expiresAt) : undefined,
      })),
    });
  }
  @Post(":purchaseId/receipts/batch") batch(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("purchaseId") id: string,
    @Body() body: BatchDto,
  ) {
    return this.purchases.receive(
      request.auth!.sub,
      organizationId,
      branchId,
      id,
      {
        ...body,
        items: body.items.map((line) => ({
          ...line,
          expiresAt: line.expiresAt ? new Date(line.expiresAt) : undefined,
        })),
      },
    );
  }
  @Post(":purchaseId/close-balance") close(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("purchaseId") id: string,
    @Body() body: CloseDto,
  ) {
    return this.purchases.closeBalance(
      request.auth!.sub,
      organizationId,
      branchId,
      id,
      body.reason,
      body.expected,
    );
  }
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.purchases.list(request.auth!.sub, organizationId, branchId);
  }
  @Post() create(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CreateDto,
  ) {
    return this.purchases.create(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
  }
  @Post(":purchaseId/receipts") receive(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("purchaseId") purchaseId: string,
    @Body() body: ReceiptDto,
  ) {
    return this.purchases.receive(
      request.auth!.sub,
      organizationId,
      branchId,
      purchaseId,
      {
        ...body,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    );
  }
}
