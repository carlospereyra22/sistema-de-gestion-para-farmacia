import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { SalesService } from "./sales.service";
import { SaleFiscalOptionsDto } from "../fiscal/sale-fiscal-options";
import { ProductionCreditService } from "../fiscal/production-credit.service";
import { ProductionSalesService } from "../fiscal/production-sales.service";

class SaleLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requestedUnitPriceMinor?: number;
  @IsOptional() @IsString() expectedUnitPriceMinor?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) unitPriceMinor?: number;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountMinor?: number;
}
class PaymentDto {
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() cashSessionId?: string;
}
class CompleteSaleDto {
  @IsOptional() @IsIn(["HOMOLOGATION", "PRODUCTION"]) fiscalEnvironment?:
    "HOMOLOGATION" | "PRODUCTION";
  @IsOptional() @IsBoolean() confirmProduction?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => SaleFiscalOptionsDto)
  fiscalOptions?: SaleFiscalOptionsDto;
  @IsOptional() @IsBoolean() confirmHomologation?: boolean;
  @IsOptional() @IsIn(["INTERNAL", "INVOICE"]) documentType?:
    "INTERNAL" | "INVOICE";
  @IsOptional() @IsUUID() priceListId?: string;
  @IsOptional() @IsUUID() clientOperationId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items!: SaleLineDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments!: PaymentDto[];
}
class ReasonDto {
  @IsString() @MinLength(3) reason!: string;
}
class CustomerReturnItemDto {
  @IsString() saleItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
class CustomerReturnDto extends ReasonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerReturnItemDto)
  items!: CustomerReturnItemDto[];
}
class CreditDto extends CustomerReturnDto {
  @IsUUID() requestId!: string;
  @IsBoolean() confirmProduction!: boolean;
}
class SettleCreditDto {
  @IsInt() @Min(0) expectedAccountMinor!: number;
  @IsInt() @Min(0) expectedRefundMinor!: number;
  @IsIn(["CASH", "CARD", "TRANSFER"]) method!: "CASH" | "CARD" | "TRANSFER";
  @IsOptional() @IsUUID() cashSessionId?: string;
  @IsString() @MinLength(3) @MaxLength(300) reference!: string;
  @IsBoolean() received!: boolean;
  @IsBoolean() confirm!: boolean;
}

@Controller("organizations/:organizationId/branches/:branchId/sales")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly credits: ProductionCreditService,
    private readonly production: ProductionSalesService,
  ) {}
  @Get(":saleId/credits") creditsDetail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ) {
    return this.credits.detail(req.auth!.sub, org, branch, saleId);
  }
  @Post(":saleId/credits") createCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Body() input: CreditDto,
  ) {
    return this.credits.create(req.auth!.sub, org, branch, saleId, input);
  }
  @Post(":saleId/credits/:documentId/process") processCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return this.production.process(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
    );
  }
  @Get(":saleId/credits/:documentId/settlement") creditSettlement(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return this.credits.previewSettlement(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
    );
  }
  @Post(":saleId/credits/:documentId/settlement") settleCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: SettleCreditDto,
  ) {
    return this.credits.settle(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
      input,
    );
  }
  @Get("fiscal-options") fiscalOptions(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.sales.fiscalOptions(req.auth!.sub, org, branch);
  }
  @Get(":saleId/invoice") invoice(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
  ) {
    return this.sales.invoice(req.auth!.sub, org, branch, id);
  }
  @Post(":saleId/invoice/process") processInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
  ) {
    return this.sales.invoice(req.auth!.sub, org, branch, id, true);
  }
  @Get(":saleId/ticket") ticket(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ) {
    return this.sales.ticket(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
    );
  }
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.sales.list(request.auth!.sub, organizationId, branchId);
  }
  @Post() complete(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CompleteSaleDto,
  ) {
    return this.sales.complete(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
  }
  @Post(":saleId/cancel")
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId") saleId: string,
    @Body() body: ReasonDto,
  ) {
    return this.sales.cancel(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
      body.reason,
    );
  }
  @Post(":saleId/customer-returns")
  customerReturn(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId") saleId: string,
    @Body() body: CustomerReturnDto,
  ) {
    return this.sales.customerReturn(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
      body,
    );
  }
}
