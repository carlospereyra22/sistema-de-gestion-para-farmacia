import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsBoolean,
  IsIn,
  MaxLength,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { CashMovementType } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { CashService } from "./cash.service";

class CreateRegisterDto {
  @IsOptional() @IsString() @MaxLength(100) responsibleName?: string | null;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(30) code?: string;
}
class CashSettingsDto {
  @IsBoolean() allowWithoutSession!: boolean;
  @IsBoolean() askOpeningAmount!: boolean;
  @IsBoolean() requireMovementReason!: boolean;
  @IsBoolean() allowManualMovements!: boolean;
  @IsOptional() @IsUUID() defaultRegisterId?: string | null;
  @IsInt() @Min(0) version!: number;
}
class AssignCollectionDto {
  @IsUUID() cashSessionId!: string;
}
class CollectionDestinationDto {
  @IsUUID() cashRegisterId!: string;
}
class OpenSessionDto {
  @IsString() cashRegisterId!: string;
  @Type(() => Number) @IsInt() @Min(0) openingAmountMinor!: number;
}
class CloseSessionDto {
  @Type(() => Number) @IsInt() @Min(0) closingAmountMinor!: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() expectedAmountMinor?: number;
}
class CashMovementDto {
  @IsOptional() @IsUUID() clientOperationId?: string;
  @IsEnum(CashMovementType) type!: CashMovementType;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsString() @MaxLength(300) reason!: string;
}
class CashClosuresQueryDto {
  @IsOptional() @IsIn(["true", "false"]) archived?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
class EditRegisterDto {
  @IsOptional() @IsString() @MaxLength(100) responsibleName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) expectedResponsibleName?:
    string | null;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsBoolean() active!: boolean;
  @IsString() expectedName!: string;
  @IsBoolean() expectedActive!: boolean;
}
class ClosureVisibilityDto {
  @IsBoolean() archived!: boolean;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

@Controller("organizations/:organizationId/branches/:branchId/cash")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class CashController {
  constructor(private readonly cash: CashService) {}
  @Get("registers/:registerId/latest-closure") async latestClosure(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("registerId", ParseUUIDPipe) registerId: string,
  ) {
    const rows = await this.cash.closures(
      request.auth!.sub,
      organizationId,
      branchId,
      undefined,
      undefined,
      false,
      registerId,
      1,
    );
    return rows[0] ?? null;
  }
  @Get("settings") settings(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.cash.settings(request.auth!.sub, organizationId, branchId);
  }
  @Patch("settings") saveSettings(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CashSettingsDto,
  ) {
    return this.cash.saveSettings(request.auth!.sub, organizationId, branchId, {
      ...body,
      defaultRegisterId: body.defaultRegisterId ?? null,
    });
  }
  @Post("pending-collections/:collectionId/destination") collectionDestination(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() body: CollectionDestinationDto,
  ) {
    return this.cash.setCollectionDestination(
      request.auth!.sub,
      organizationId,
      branchId,
      collectionId,
      body.cashRegisterId,
    );
  }
  @Get("pending-collections") pendingCollections(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.cash.pendingCollections(
      request.auth!.sub,
      organizationId,
      branchId,
    );
  }

  @Post("pending-collections/:collectionId/assign") assignCollection(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() body: AssignCollectionDto,
  ) {
    return this.cash.assignCollection(
      request.auth!.sub,
      organizationId,
      branchId,
      collectionId,
      body.cashSessionId,
    );
  }
  @Get("management") management(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.cash.management(request.auth!.sub, organizationId, branchId);
  }
  @Patch("registers/:registerId") editRegister(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("registerId", ParseUUIDPipe) registerId: string,
    @Body() body: EditRegisterDto,
  ) {
    return this.cash.editRegister(
      request.auth!.sub,
      organizationId,
      branchId,
      registerId,
      body,
    );
  }
  @Patch("closures/:sessionId") archiveClosure(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() body: ClosureVisibilityDto,
  ) {
    return this.cash.archiveClosure(
      request.auth!.sub,
      organizationId,
      branchId,
      sessionId,
      body.archived,
      body.reason,
    );
  }
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.cash.list(request.auth!.sub, organizationId, branchId);
  }
  @Get("closures") closures(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query() query: CashClosuresQueryDto,
  ) {
    return this.cash.closures(
      request.auth!.sub,
      organizationId,
      branchId,
      query.from,
      query.to,
      query.archived === "true",
    );
  }
  @Get("closures/:sessionId") closureDetail(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.cash.closureDetail(
      request.auth!.sub,
      organizationId,
      branchId,
      sessionId,
    );
  }
  @Post("registers") createRegister(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CreateRegisterDto,
  ) {
    return this.cash.createRegister(
      request.auth!.sub,
      organizationId,
      branchId,
      body.name,
      body.code,
      body.responsibleName,
    );
  }
  @Post("sessions") open(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OpenSessionDto,
  ) {
    return this.cash.open(request.auth!.sub, organizationId, branchId, body);
  }
  @Post("sessions/:sessionId/close") close(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: CloseSessionDto,
  ) {
    return this.cash.close(
      request.auth!.sub,
      organizationId,
      branchId,
      sessionId,
      body,
    );
  }
  @Post("sessions/:sessionId/movements") movement(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: CashMovementDto,
  ) {
    return this.cash.movement(
      request.auth!.sub,
      organizationId,
      branchId,
      sessionId,
      body,
    );
  }
}
