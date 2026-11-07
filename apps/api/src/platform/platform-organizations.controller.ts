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
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformOrganizationsService } from "./platform-organizations.service";

const MINOR = /^\d{1,14}$/;

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

class PlanPricesDto {
  @IsString() @Matches(MINOR) baseMinor!: string;
  @IsString() @Matches(MINOR) extraUserMinor!: string;
  @IsString() @Matches(MINOR) extraBranchMinor!: string;
}

@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformOrganizationsController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

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
