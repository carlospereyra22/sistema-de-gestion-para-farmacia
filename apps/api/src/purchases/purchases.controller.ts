import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type, plainToInstance } from "class-transformer";
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
  Max,
  Min,
  Matches,
  ValidateNested,
  IsIn,
  IsISO8601,
  IsObject,
  validate,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { HistorialQueryDto } from "../common/db/historial-query.dto";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { PurchasesService } from "./purchases.service";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import type { OperacionCompraSinConexion } from "./purchase-input";

class LineDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostMinor!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(1000)
  packFactor?: number;
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
/** Pedido, compra directa o recepción hecho sin conexión (SISTEMA-69). */
class OfflinePurchaseDto {
  @IsIn(["PEDIDO", "DIRECTA", "RECEPCION"]) tipo!:
    "PEDIDO" | "DIRECTA" | "RECEPCION";
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  @IsOptional() @IsUUID() purchaseId?: string;
  /** La misma solicitud que con conexión. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflinePurchaseDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(400000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
const fechas = <T extends { expiresAt?: string }>(lineas: T[]) =>
  lineas.map((linea) => ({
    ...linea,
    expiresAt: linea.expiresAt ? new Date(linea.expiresAt) : undefined,
  }));
/** Valida el cuerpo con el DTO de su tipo, como la ruta con conexión. */
async function operacionDeCompra(
  datos: unknown,
): Promise<OperacionCompraSinConexion & { deviceId: string }> {
  const op = plainToInstance(OfflinePurchaseDto, datos);
  const DTO: new () => object =
    op?.tipo === "PEDIDO"
      ? CreateDto
      : op?.tipo === "DIRECTA"
        ? DirectDto
        : BatchDto;
  const cuerpo = plainToInstance(DTO, op?.cuerpo ?? {});
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const errores = [
    ...(await validate(op ?? {}, opciones)),
    ...(await validate(cuerpo, opciones)),
  ];
  if (errores.length || (op.tipo === "RECEPCION" && !op.purchaseId))
    throw new BadRequestException(
      "La operación de compras sin conexión tiene datos inválidos.",
    );
  if (op.tipo === "PEDIDO")
    return { ...op, tipo: "PEDIDO", cuerpo: cuerpo as CreateDto };
  if (op.tipo === "DIRECTA") {
    const directa = cuerpo as DirectDto;
    return {
      ...op,
      tipo: "DIRECTA",
      cuerpo: { ...directa, receipts: fechas(directa.receipts) },
    };
  }
  const recepcion = cuerpo as BatchDto;
  return {
    ...op,
    tipo: "RECEPCION",
    purchaseId: op.purchaseId!,
    cuerpo: { ...recepcion, items: fechas(recepcion.items) },
  };
}

@Controller("organizations/:organizationId/branches/:branchId/purchases")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}
  // Antes de :purchaseId para que "lots" no se tome como una compra.
  @Get("lots") lots(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.purchases.lots(request.auth!.sub, organizationId, branchId);
  }
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
  /** Operación de compras hecha sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OfflinePurchaseDto,
  ) {
    return this.purchases.completeOffline(
      request.auth!.sub,
      organizationId,
      branchId,
      await operacionDeCompra(body),
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SignedOfflinePurchaseDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeCompra(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.purchases.completeOfflineSigned(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
      op,
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
    @Query() filtro: HistorialQueryDto,
  ) {
    return this.purchases.list(
      request.auth!.sub,
      organizationId,
      branchId,
      filtro,
    );
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
