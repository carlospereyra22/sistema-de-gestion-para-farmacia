import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@prisma/client";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { AccountsService } from "./accounts.service";
import type { ReceiptPayment } from "./receipt-payments";
class ConfigureDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  accountTermDays?: number | null;
  @IsBoolean() enabled!: boolean;
  @ValidateIf((_object, value: unknown) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditLimitMinor!: number | null;
}
class AllocationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) nextPendingMinor?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPendingMinor?: number;
  @IsUUID() saleItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
}
class PriceUpdateDto {
  @IsString() fingerprint!: string;
  @IsUUID() clientOperationId!: string;
}
class DebtIncreaseDto {
  @Type(() => Number) @IsInt() @Min(1) expectedPendingMinor!: number;
  @Type(() => Number) @IsInt() @Min(1) nextPendingMinor!: number;
  @IsString() reason!: string;
  @IsUUID() clientOperationId!: string;
}
class AssignDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}
class ExpectedDebtItemDto {
  @IsUUID() saleItemId!: string;
  @IsString() pendingMinor!: string;
}
class TotalDebtIncreaseDto extends DebtIncreaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpectedDebtItemDto)
  expectedItems!: ExpectedDebtItemDto[];
}
class ReceiptPaymentDto {
  @IsEnum(PaymentMethod) method!: ReceiptPayment["method"];
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
}
class ReceiptDto extends AssignDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentDto)
  payments?: ReceiptPaymentDto[];
  @IsUUID() clientOperationId!: string;
  @IsOptional() @IsUUID() cashSessionId?: string;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() note?: string;
}
@Controller(
  "organizations/:organizationId/branches/:branchId/customer-accounts",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  @Get("due-sales/:saleId") dueSaleDetail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId") sale: string,
  ) {
    return this.accounts.dueSaleDetail(req.auth!.sub, org, branch, sale);
  }
  @Get("statement") statement(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.accounts.statement(req.auth!.sub, org, branch);
  }
  @Post(":customerId/debt-increase") increaseTotalDebt(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customer: string,
    @Body() body: TotalDebtIncreaseDto,
  ) {
    return this.accounts.increaseTotalDebt(req.auth!.sub, org, customer, body);
  }
  @Get("due-dates") dueDates(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.accounts.dueDates(req.auth!.sub, org, branch);
  }
  @Post(":customerId/items/:itemId/debt-increase") increaseDebt(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customer: string,
    @Param("itemId") item: string,
    @Body() body: DebtIncreaseDto,
  ) {
    return this.accounts.increaseDebt(req.auth!.sub, org, customer, item, body);
  }
  @Get(":customerId/receipts/:receiptId") receipt(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customer: string,
    @Param("receiptId") receiptId: string,
  ) {
    return this.accounts.receipt(req.auth!.sub, org, customer, receiptId);
  }
  @Get(":customerId/sales/:saleId/price-update") pricePreview(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customer: string,
    @Param("saleId") sale: string,
  ) {
    return this.accounts.previewPrices(req.auth!.sub, org, customer, sale);
  }
  @Post(":customerId/sales/:saleId/price-update") priceUpdate(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customer: string,
    @Param("saleId") sale: string,
    @Body() body: PriceUpdateDto,
  ) {
    return this.accounts.updatePrices(
      req.auth!.sub,
      org,
      customer,
      sale,
      body.fingerprint,
      body.clientOperationId,
    );
  }
  @Get(":customerId/items") items(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customerId: string,
  ) {
    return this.accounts.items(req.auth!.sub, org, customerId);
  }
  @Post(":customerId/movements/:movementId/allocations") assign(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customerId: string,
    @Param("movementId") movementId: string,
    @Body() body: AssignDto,
  ) {
    return this.accounts.assignItems(
      req.auth!.sub,
      org,
      customerId,
      movementId,
      body.allocations,
    );
  }
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
  ) {
    return this.accounts.list(req.auth!.sub, org);
  }
  @Get(":customerId/movements/:movementId/sale") detail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customerId: string,
    @Param("movementId") movementId: string,
  ) {
    return this.accounts.saleDetail(req.auth!.sub, org, customerId, movementId);
  }
  @Patch(":customerId") configure(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId") customerId: string,
    @Body() body: ConfigureDto,
  ) {
    return this.accounts.configure(
      req.auth!.sub,
      org,
      customerId,
      body.enabled,
      body.creditLimitMinor,
      body.accountTermDays,
    );
  }
  @Post(":customerId/receipts") pay(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("customerId") customerId: string,
    @Body() body: ReceiptDto,
  ) {
    return this.accounts.pay(
      req.auth!.sub,
      org,
      branch,
      customerId,
      body.amountMinor,
      body.method,
      body.note,
      body.cashSessionId,
      body.clientOperationId,
      body.allocations,
      body.payments,
    );
  }
}
