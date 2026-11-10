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
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateIf,
  Matches,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { HistorialQueryDto } from "../common/db/historial-query.dto";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { InventoryService } from "./inventory.service";
import { partesPedidas } from "../catalog/catalogo-por-partes";

/** Partes pedidas del stock o de los costos: "0a,1f,..." (hasta 32) (SISTEMA-77). */
class StockPartsQuery {
  @IsString()
  @Matches(/^[0-9a-f]{2}(,[0-9a-f]{2}){0,31}$/)
  partes!: string;
}

class ReceiveStockDto {
  @IsString() productId!: string;
  // null: se cargó como Sin proveedor.
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  supplierId!: string | null;
  @IsString() @MinLength(1) lotNumber!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostMinor!: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}

class AdjustStockDto {
  @IsString() lotId!: string;
  @Type(() => Number) @IsInt() quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
  // null es Sin proveedor; sin el campo, no se indicó.
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitCostMinor?: number;
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
  // null: stock sin proveedor conocido.
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  supplierId!: string | null;
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

  /** Stock por partes (SISTEMA-77): la versión de cada parte. */
  @Get("stock/versiones")
  stockVersions(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.stockVersions(
      request.auth!.sub,
      organizationId,
      branchId,
    );
  }

  /** Lotes de algunas partes del stock (SISTEMA-77). */
  @Get("stock/partes")
  stockParts(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query() query: StockPartsQuery,
  ) {
    let partes: string[];
    try {
      partes = partesPedidas(query.partes);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Partes inválidas.",
      );
    }
    return this.inventory.stockParts(
      request.auth!.sub,
      organizationId,
      branchId,
      partes,
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

  /** Costos por partes (SISTEMA-78): la versión de cada parte. */
  @Get("costs/versiones")
  costsVersions(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.costsVersions(
      request.auth!.sub,
      organizationId,
      branchId,
    );
  }

  /** Costos de algunas partes (SISTEMA-78). */
  @Get("costs/partes")
  costsParts(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query() query: StockPartsQuery,
  ) {
    let partes: string[];
    try {
      partes = partesPedidas(query.partes);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Partes inválidas.",
      );
    }
    return this.inventory.costsParts(
      request.auth!.sub,
      organizationId,
      branchId,
      partes,
    );
  }

  @Get("costs")
  costs(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.costs(request.auth!.sub, organizationId, branchId);
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
    @Query() filtro: HistorialQueryDto,
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.inventory.history(
      request.auth!.sub,
      organizationId,
      branchId,
      filtro,
    );
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
