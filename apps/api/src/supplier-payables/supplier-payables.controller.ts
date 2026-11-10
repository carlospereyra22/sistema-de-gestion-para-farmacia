import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  validate,
} from "class-validator";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import {
  NewPayableDto,
  PayableQueryDto,
  PaySupplierDto,
  VoidSupplierPaymentDto,
} from "./supplier-payables.dto";
import { SupplierPayablesService } from "./supplier-payables.service";
import type {
  OperacionPagarSinConexion,
  TipoOperacionPagar,
} from "./pagar-sin-conexion";

// --- Cuentas por pagar sin conexión (SISTEMA-73) ---
const CUERPO_POR_TIPO = {
  DEUDA: NewPayableDto,
  PAGO: PaySupplierDto,
  ANULAR: VoidSupplierPaymentDto,
} as const;
class OfflinePayableDto {
  @IsIn(Object.keys(CUERPO_POR_TIPO)) tipo!: TipoOperacionPagar;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** Deuda del pago o de la anulación: su id o su clave. */
  @IsOptional() @IsUUID() invoiceId?: string;
  /** Pago que se anula: su id o su clave. */
  @IsOptional() @IsUUID() paymentId?: string;
  /** La misma operación que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflinePayableDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(100000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
/** Valida la operación y su cuerpo con el DTO de su tipo, como con conexión. */
async function operacionDePagar(
  datos: unknown,
): Promise<OperacionPagarSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflinePayableDto, datos ?? {});
  const errores = await validate(op, opciones);
  const DTO = CUERPO_POR_TIPO[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  if (
    errores.length ||
    !cuerpo ||
    (await validate(cuerpo, opciones)).length ||
    (op.tipo !== "DEUDA" && !op.invoiceId) ||
    (op.tipo === "ANULAR" && !op.paymentId)
  )
    throw new BadRequestException(
      "La operación de cuentas por pagar sin conexión tiene datos inválidos.",
    );
  return { ...op, cuerpo } as unknown as OperacionPagarSinConexion;
}
@Controller(
  "organizations/:organizationId/branches/:branchId/supplier-payables",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class SupplierPayablesController {
  constructor(private readonly service: SupplierPayablesService) {}
  @Post(":id/payments") pay(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PaySupplierDto,
  ) {
    return this.service.pay(req.auth!.sub, org, branch, id, body);
  }
  @Post(":id/payments/:paymentId/void") voidPayment(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @Body() body: VoidSupplierPaymentDto,
  ) {
    return this.service.voidPayment(
      req.auth!.sub,
      org,
      branch,
      id,
      paymentId,
      body.reason,
    );
  }
  /** Deuda, pago o anulación hecho sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: OfflinePayableDto,
  ) {
    return this.service.completeOffline(
      req.auth!.sub,
      org,
      branch,
      await operacionDePagar(body),
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: SignedOfflinePayableDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDePagar(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.service.completeOfflineSigned(
      req.auth!.sub,
      org,
      branch,
      body,
      op,
    );
  }
  /** Copia de las deudas para usar Cuentas por pagar sin conexión. */
  @Get("base-local") baseLocal(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.service.baseLocal(req.auth!.sub, org, branch);
  }
  @Get("options") options(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.service.options(req.auth!.sub, org, branch);
  }
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Query()
    query: PayableQueryDto,
  ) {
    return this.service.list(req.auth!.sub, org, branch, query);
  }
  @Get(":id") detail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(req.auth!.sub, org, branch, id);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: NewPayableDto,
  ) {
    return this.service.create(req.auth!.sub, org, branch, body);
  }
}
