import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type, plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
  validate,
} from "class-validator";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import type {
  OperacionCuentaSinConexion,
  TipoOperacionCuenta,
} from "./cuenta-sin-conexion";
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
// --- Cuenta corriente sin conexión (SISTEMA-70) ---
class LineaSinConexionDto {
  @IsUUID() saleId!: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}
/** Un artículo conocido o un renglón de una venta hecha sin conexión. */
class DestinoSinConexionDto {
  @IsOptional() @IsUUID() saleItemId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => LineaSinConexionDto)
  linea?: LineaSinConexionDto;
}
class ImputacionSinConexionDto extends DestinoSinConexionDto {
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPendingMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) nextPendingMinor?: number;
}
class CobroSinConexionDto {
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsIn(["CASH", "CARD", "TRANSFER", "OTHER"]) method!:
    "CASH" | "CARD" | "TRANSFER" | "OTHER";
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentDto)
  payments?: ReceiptPaymentDto[];
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsUUID() cashSessionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImputacionSinConexionDto)
  imputaciones?: ImputacionSinConexionDto[];
}
class AsignacionSinConexionDto {
  @IsUUID() movementId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImputacionSinConexionDto)
  imputaciones!: ImputacionSinConexionDto[];
}
class AumentoSinConexionDto {
  @ValidateNested()
  @Type(() => DestinoSinConexionDto)
  destino!: DestinoSinConexionDto;
  @Type(() => Number) @IsInt() @Min(1) expectedPendingMinor!: number;
  @Type(() => Number) @IsInt() @Min(1) nextPendingMinor!: number;
  @IsString() @MaxLength(300) reason!: string;
}
class AumentoTotalSinConexionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedPendingMinor!: number;
  @Type(() => Number) @IsInt() @Min(1) nextPendingMinor!: number;
  @IsString() @MaxLength(300) reason!: string;
}
class ReferenciaVistaDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) referencePriceMinor!: number;
}
class PreciosSinConexionDto {
  /** Una venta, o "all" para toda la cuenta. */
  @Matches(/^(all|[0-9a-f-]{36})$/i) saleId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaVistaDto)
  referencias!: ReferenciaVistaDto[];
}
const CUERPO_POR_TIPO = {
  COBRO: CobroSinConexionDto,
  ASIGNACION: AsignacionSinConexionDto,
  AUMENTO_DEUDA: AumentoSinConexionDto,
  AUMENTO_DEUDA_TOTAL: AumentoTotalSinConexionDto,
  ACTUALIZAR_PRECIOS: PreciosSinConexionDto,
  CONFIGURAR: ConfigureDto,
} as const;
class OfflineAccountDto {
  @IsIn(Object.keys(CUERPO_POR_TIPO)) tipo!: TipoOperacionCuenta;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  @IsUUID() customerId!: string;
  /** La misma operación que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflineAccountDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(200000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
/** Valida la operación y su cuerpo con el DTO de su tipo, como con conexión. */
async function operacionDeCuenta(
  datos: unknown,
): Promise<OperacionCuentaSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineAccountDto, datos ?? {});
  const errores = await validate(op, opciones);
  const DTO = CUERPO_POR_TIPO[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  if (errores.length || !cuerpo || (await validate(cuerpo, opciones)).length)
    throw new BadRequestException(
      "La operación de cuenta corriente sin conexión tiene datos inválidos.",
    );
  const destinos = [
    ...("imputaciones" in cuerpo && Array.isArray(cuerpo.imputaciones)
      ? (cuerpo.imputaciones as DestinoSinConexionDto[])
      : []),
    ...("destino" in cuerpo ? [cuerpo.destino as DestinoSinConexionDto] : []),
  ];
  if (destinos.some((d) => Boolean(d.saleItemId) === Boolean(d.linea)))
    throw new BadRequestException(
      "Cada importe tiene que ir a un artículo o a un renglón de una venta.",
    );
  return { ...op, cuerpo } as unknown as OperacionCuentaSinConexion;
}

@Controller(
  "organizations/:organizationId/branches/:branchId/customer-accounts",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  /** Operación de cuenta corriente hecha sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offline(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: OfflineAccountDto,
  ) {
    return this.accounts.completeOffline(
      req.auth!.sub,
      org,
      branch,
      await operacionDeCuenta(body),
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Body() body: SignedOfflineAccountDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeCuenta(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.accounts.completeOfflineSigned(
      req.auth!.sub,
      org,
      branch,
      body,
      op,
    );
  }
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
  @Get(":customerId/movements") movements(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("customerId", ParseUUIDPipe) customerId: string,
  ) {
    return this.accounts.movements(req.auth!.sub, org, customerId);
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
