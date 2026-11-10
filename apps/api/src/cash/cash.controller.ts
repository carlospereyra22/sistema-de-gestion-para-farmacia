import type { TipoOperacionCaja } from "./offline-cash";
import {
  BadRequestException,
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
import { Type, plainToInstance } from "class-transformer";
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
  IsISO8601,
  validate,
} from "class-validator";
import { CashMovementType } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { CashService } from "./cash.service";
import {
  AllowWhenReadOnly,
  DecidedWhenOccurred,
} from "../platform/subscription-gate";

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
class ClearCollectionDestinationDto {
  @IsUUID() expectedRegisterId!: string;
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
/** Apertura, movimiento o cierre hecho sin conexión (SISTEMA-67). */
class OfflineCashDto {
  @IsIn([
    "APERTURA",
    "MOVIMIENTO",
    "CIERRE",
    "COBRO_DESTINO",
    "COBRO_INCORPORAR",
    "COBRO_QUITAR",
  ])
  tipo!: TipoOperacionCaja;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  @IsOptional() @IsUUID() cashRegisterId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingAmountMinor?: number;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsIn(["IN", "OUT"]) type?: "IN" | "OUT";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amountMinor?: number;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  closingAmountMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() expectedAmountMinor?: number;
  /** Cobro pendiente de caja (SISTEMA-81). */
  @IsOptional() @IsUUID() collectionId?: string;
  @IsOptional() @IsUUID() expectedRegisterId?: string;
}
/** La de otro usuario de la PC, firmada por él (SISTEMA-67). */
class SignedOfflineCashDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(20000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
class ClosureVisibilityDto {
  @IsBoolean() archived!: boolean;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

@Controller("organizations/:organizationId/cash")
@UseGuards(JwtAccessGuard)
export class CashOrganizationController {
  constructor(private readonly cash: CashService) {}
  @Get("registers") registers(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.cash.organizationRegisters(request.auth!.sub, organizationId);
  }
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
  @Get("registers/:registerId/recent-activity") recentActivity(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("registerId", ParseUUIDPipe) registerId: string,
  ) {
    return this.cash.recentActivity(
      request.auth!.sub,
      organizationId,
      branchId,
      registerId,
    );
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
  @AllowWhenReadOnly()
  @Post("pending-collections/:collectionId/destination")
  collectionDestination(
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
  @AllowWhenReadOnly()
  @Post("pending-collections/:collectionId/destination/clear")
  clearCollectionDestination(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("collectionId", ParseUUIDPipe) collectionId: string,
    @Body() body: ClearCollectionDestinationDto,
  ) {
    return this.cash.clearCollectionDestination(
      request.auth!.sub,
      organizationId,
      branchId,
      collectionId,
      body.expectedRegisterId,
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

  @AllowWhenReadOnly()
  @Post("pending-collections/:collectionId/assign")
  assignCollection(
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
  @AllowWhenReadOnly()
  @Post("sessions/:sessionId/close")
  close(
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
  /** Operación de caja hecha sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  offline(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OfflineCashDto,
  ) {
    return this.cash.completeOffline(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SignedOfflineCashDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = plainToInstance(OfflineCashDto, datos);
    const errores = await validate(op, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errores.length)
      throw new BadRequestException(
        "La operación firmada tiene datos inválidos.",
      );
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.cash.completeOfflineSigned(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
      op,
    );
  }
}
