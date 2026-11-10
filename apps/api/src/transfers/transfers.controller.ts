import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type, plainToInstance } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
  validate,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { TransfersService } from "./transfers.service";
import {
  AllowWhenReadOnly,
  DecidedWhenOccurred,
} from "../platform/subscription-gate";
import type {
  OperacionTransferenciaSinConexion,
  TipoOperacionTransferencia,
} from "./transferencia-sin-conexion";
class ItemDto {
  @IsString() lotId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
class CreateDto {
  @IsString() destinationBranchId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items!: ItemDto[];
  /** Clave de la PC: si la respuesta se pierde, no se crea dos veces. */
  @IsOptional() @IsUUID() clientOperationId?: string;
}
// --- Transferencias sin conexión (SISTEMA-71) ---
/** Un lote por su id, o por producto y número si se recibió sin conexión. */
class RenglonSinConexionDto {
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MaxLength(80) lotNumber?: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
class PrepararSinConexionDto {
  @IsUUID() destinationBranchId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RenglonSinConexionDto)
  items!: RenglonSinConexionDto[];
}
class AvanzarSinConexionDto {
  @IsUUID() transferId!: string;
}
const CUERPO_POR_TIPO = {
  PREPARAR: PrepararSinConexionDto,
  DESPACHAR: AvanzarSinConexionDto,
  RECIBIR: AvanzarSinConexionDto,
} as const;
class OfflineTransferDto {
  @IsIn(Object.keys(CUERPO_POR_TIPO)) tipo!: TipoOperacionTransferencia;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** La misma operación que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflineTransferDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(200000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
/** Valida la operación y su cuerpo con el DTO de su tipo, como con conexión. */
async function operacionDeTransferencia(
  datos: unknown,
): Promise<OperacionTransferenciaSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineTransferDto, datos ?? {});
  const errores = await validate(op, opciones);
  const DTO = CUERPO_POR_TIPO[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  if (errores.length || !cuerpo || (await validate(cuerpo, opciones)).length)
    throw new BadRequestException(
      "La transferencia sin conexión tiene datos inválidos.",
    );
  if (
    cuerpo instanceof PrepararSinConexionDto &&
    cuerpo.items.some(
      (item) => !item.lotId && !(item.productId && item.lotNumber),
    )
  )
    throw new BadRequestException(
      "Cada renglón tiene que indicar el lote, o el producto y el número de lote.",
    );
  return { ...op, cuerpo } as unknown as OperacionTransferenciaSinConexion;
}
@Controller("organizations/:organizationId/branches/:branchId/transfers")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.transfers.list(req.auth!.sub, organizationId, branchId);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CreateDto,
  ) {
    return this.transfers.create(req.auth!.sub, organizationId, branchId, body);
  }
  /** Transferencia hecha sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OfflineTransferDto,
  ) {
    return this.transfers.completeOffline(
      req.auth!.sub,
      organizationId,
      branchId,
      await operacionDeTransferencia(body),
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SignedOfflineTransferDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeTransferencia(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.transfers.completeOfflineSigned(
      req.auth!.sub,
      organizationId,
      branchId,
      body,
      op,
    );
  }
  @Post(":id/dispatch") dispatch(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("id") id: string,
  ) {
    return this.transfers.dispatch(req.auth!.sub, organizationId, branchId, id);
  }
  @AllowWhenReadOnly()
  @Post(":id/receive")
  receive(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("id") id: string,
  ) {
    return this.transfers.receive(req.auth!.sub, organizationId, branchId, id);
  }
}
