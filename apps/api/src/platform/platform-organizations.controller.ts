import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformBillingService } from "./platform-billing.service";
import { PlatformOrganizationsService } from "./platform-organizations.service";

const MINOR = /^\d{1,14}$/;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

class NewOrganizationDto {
  @IsString() @MinLength(2) @MaxLength(200) organizationName!: string;
  @IsString() @MinLength(2) @MaxLength(200) branchName!: string;
  @IsEmail() @MaxLength(200) ownerEmail!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(90) trialDays!: number;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(60) contactPhone?: string;
}

class NewUserDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsString() @MaxLength(32) roleCode!: string;
}

class NewBranchDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}

class SubscriptionDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1000) extraUsers!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1000) extraBranches!: number;
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(MINOR)
  agreedPriceMinor!: string | null;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(60) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string;
}

class PaymentDto {
  @IsUUID() operationId!: string;
  @IsString() @Matches(MINOR) amountMinor!: string;
  @Matches(CIVIL_DATE) @IsDateString({ strict: true }) paidOn!: string;
  @IsIn(["TRANSFER", "CASH", "CHECK", "OTHER"]) method!: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
}

class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(300) @Matches(/\S/) reason!: string;
}

class ExtensionDto extends ReasonDto {
  @ValidateIf((_, value) => value !== null)
  @Matches(CIVIL_DATE)
  @IsDateString({ strict: true })
  until!: string | null;
}

class PlanPricesDto {
  @IsString() @Matches(MINOR) baseMinor!: string;
  @IsString() @Matches(MINOR) extraUserMinor!: string;
  @IsString() @Matches(MINOR) extraBranchMinor!: string;
}

@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformOrganizationsController {
  constructor(
    private readonly organizations: PlatformOrganizationsService,
    private readonly billing: PlatformBillingService,
  ) {}

  @Get("organizations")
  list() {
    return this.organizations.list();
  }

  @Post("organizations")
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: NewOrganizationDto,
  ) {
    return this.organizations.create(request.auth!.sub, body);
  }

  @Get("organizations/:id")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.organizations.detail(id);
  }

  @Post("organizations/:id/users")
  addUser(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: NewUserDto,
  ) {
    return this.organizations.addUser(request.auth!.sub, id, body);
  }

  @Post("organizations/:id/branches")
  addBranch(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: NewBranchDto,
  ) {
    return this.organizations.addBranch(request.auth!.sub, id, body);
  }

  @Post("organizations/:id/users/:userId/reset-password")
  @HttpCode(200)
  resetPassword(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.organizations.resetPassword(request.auth!.sub, id, userId);
  }

  @Patch("organizations/:id/subscription")
  updateSubscription(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SubscriptionDto,
  ) {
    return this.organizations.updateSubscription(request.auth!.sub, id, body);
  }

  @Get("payments")
  recentPayments() {
    return this.billing.recentPayments();
  }

  @Post("organizations/:id/payments")
  registerPayment(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PaymentDto,
  ) {
    return this.billing.registerPayment(request.auth!.sub, id, body);
  }

  @Post("organizations/:id/payments/:paymentId/void")
  @HttpCode(200)
  voidPayment(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @Body() body: ReasonDto,
  ) {
    return this.billing.voidPayment(
      request.auth!.sub,
      id,
      paymentId,
      body.reason,
    );
  }

  @Post("organizations/:id/charges/:chargeId/waive")
  @HttpCode(200)
  waiveCharge(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("chargeId", ParseUUIDPipe) chargeId: string,
    @Body() body: ReasonDto,
  ) {
    return this.billing.waiveCharge(
      request.auth!.sub,
      id,
      chargeId,
      body.reason,
    );
  }

  @Post("organizations/:id/extension")
  @HttpCode(200)
  extend(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ExtensionDto,
  ) {
    return this.billing.extend(request.auth!.sub, id, body);
  }

  @Get("plans")
  plans() {
    return this.organizations.plans();
  }

  @Patch("plans/:id")
  updatePlan(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PlanPricesDto,
  ) {
    return this.organizations.updatePlan(request.auth!.sub, id, body);
  }
}
