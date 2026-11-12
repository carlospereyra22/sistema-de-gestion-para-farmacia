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
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateIf,
  Matches,
  IsIn,
  IsISO8601,
  IsObject,
  ValidateNested,
  validate,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { HistorialQueryDto } from "../common/db/historial-query.dto";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { InventoryService } from "./inventory.service";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import type { OperacionInventarioSinConexion } from "./inventario-sin-conexion";
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
/** Abrir cajas (SISTEMA-103). */
class SplitStockDto {
  @IsUUID() requestId!: string;
  @IsUUID() lotId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) boxes!: number;
  // Otra presentación que la del vínculo (ej. x100 en x20).
  @IsOptional() @IsUUID() targetProductId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(1000) factor?: number;
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

// --- Inventario sin conexión (SISTEMA-79) ---
/** Lote por su id, o por producto y número si se creó sin conexión. */
class LoteOfflineDto {
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) number?: string;
}
class AjusteOfflineDto {
  @ValidateNested() @Type(() => LoteOfflineDto) lote!: LoteOfflineDto;
  @IsInt() quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsInt() @Min(0) unitCostMinor?: number;
}
class DevolucionOfflineDto {
  @ValidateNested() @Type(() => LoteOfflineDto) lote!: LoteOfflineDto;
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  supplierId!: string | null;
  @IsInt() @Min(1) quantity!: number;
  @IsString() @IsNotEmpty() reason!: string;
}
class EdicionLoteOfflineDto {
  @ValidateNested() @Type(() => LoteOfflineDto) lote!: LoteOfflineDto;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) number?: string;
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresAt?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{1,14}$/) unitCostMinor?: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
/** Abrir cajas sin conexión (SISTEMA-103). */
class AperturaOfflineDto {
  @ValidateNested() @Type(() => LoteOfflineDto) lote!: LoteOfflineDto;
  @IsInt() @Min(1) @Max(1000000) boxes!: number;
  @IsOptional() @IsUUID() targetProductId?: string;
  @IsOptional() @IsInt() @Min(2) @Max(1000) factor?: number;
}
const CUERPO_INVENTARIO = {
  INGRESO: ReceiveStockDto,
  AJUSTE: AjusteOfflineDto,
  DEVOLUCION: DevolucionOfflineDto,
  EDICION_LOTE: EdicionLoteOfflineDto,
  APERTURA: AperturaOfflineDto,
} as const;
class OfflineInventoryDto {
  @IsIn(Object.keys(CUERPO_INVENTARIO))
  tipo!: OperacionInventarioSinConexion["tipo"];
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** El mismo cuerpo que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflineInventoryDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(20000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
/** Valida la operación y su cuerpo con el DTO de su tipo. */
async function operacionDeInventario(
  datos: unknown,
): Promise<OperacionInventarioSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineInventoryDto, datos ?? {});
  const DTO = CUERPO_INVENTARIO[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  const lote = (cuerpo as { lote?: LoteOfflineDto } | null)?.lote;
  if (
    (await validate(op, opciones)).length ||
    !cuerpo ||
    (await validate(cuerpo, opciones)).length ||
    (op.tipo !== "INGRESO" && !lote?.lotId && !(lote?.productId && lote.number))
  )
    throw new BadRequestException(
      "El movimiento de inventario guardado sin conexión tiene datos inválidos.",
    );
  return { ...op, cuerpo } as unknown as OperacionInventarioSinConexion;
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

  /** Movimiento de inventario hecho sin conexión (SISTEMA-79). */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OfflineInventoryDto,
  ) {
    return this.inventory.inventoryOffline(
      request.auth!.sub,
      organizationId,
      branchId,
      await operacionDeInventario(body),
    );
  }

  /** El de otro usuario de esta PC: queda a nombre de quien lo hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SignedOfflineInventoryDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeInventario(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.inventory.inventoryOfflineSigned(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
      op,
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

  @Post("splits")
  split(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SplitStockDto,
  ) {
    return this.inventory.split(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
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
