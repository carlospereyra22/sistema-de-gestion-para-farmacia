import {
  Body,
  Controller,
  NotFoundException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { OffersService, type AccionOferta } from "./offers.service";
import type { EstadoOferta, MedioPago, TipoOferta } from "./ofertas-motor";

const TIPOS: TipoOferta[] = [
  "PERCENT",
  "AMOUNT_OFF",
  "FIXED_PRICE",
  "BUY_X_PAY_Y",
  "NTH_UNIT_PERCENT",
  "TIERED",
  "BUNDLE",
  "PAYMENT_METHOD",
  "SPEND_THRESHOLD",
];
const MEDIOS_PAGO: MedioPago[] = [
  "CASH",
  "CARD",
  "TRANSFER",
  "ACCOUNT",
  "OTHER",
];
const ESTADOS: EstadoOferta[] = [
  "BORRADOR",
  "PROGRAMADA",
  "ACTIVA",
  "PAUSADA",
  "VENCIDA",
  "FINALIZADA",
  "ARCHIVADA",
];
const IMPORTE = /^\d{1,15}$/;

class OfferTierDto {
  @Type(() => Number) @IsInt() @Min(2) @Max(1000) minQuantity!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBps?: number | null;
  @IsOptional() @IsString() @Matches(IMPORTE) amountMinor?: string | null;
}

class OfferTargetDto {
  @IsIn(["PRODUCT", "CATEGORY", "LABORATORY"]) kind!:
    "PRODUCT" | "CATEGORY" | "LABORATORY";
  @IsUUID() id!: string;
  @IsOptional() @IsBoolean() exclude?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number | null;
}

class OfferDto {
  @IsString() @MinLength(3) @MaxLength(120) name!: string;
  @IsIn(TIPOS) type!: TipoOferta;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;
  @IsOptional() @IsBoolean() combinable?: boolean;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(127)
  weekdays?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  dayStartMinute?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dayEndMinute?: number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  branchIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  priceListIds?: string[];
  @IsOptional() @IsIn(["ALL", "MEDICATION", "NON_MEDICATION"]) productKind?:
    "ALL" | "MEDICATION" | "NON_MEDICATION";
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUnitsPerSale?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUnitsTotal?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBps?: number | null;
  @IsOptional() @IsString() @Matches(IMPORTE) amountMinor?: string | null;
  @IsOptional() @IsString() @Matches(IMPORTE) fixedPriceMinor?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  buyQuantity?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  payQuantity?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  nthUnit?: number | null;
  @IsOptional() @IsString() @Matches(IMPORTE) bundlePriceMinor?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(MEDIOS_PAGO, { each: true })
  paymentMethods?: MedioPago[] | null;
  @IsOptional() @IsBoolean() allProducts?: boolean;
  @IsOptional() @IsString() @Matches(IMPORTE) minPurchaseMinor?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OfferTierDto)
  tiers?: OfferTierDto[];
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => OfferTargetDto)
  targets!: OfferTargetDto[];
}

class CreateOfferDto extends OfferDto {
  @IsOptional() @IsBoolean() publicar?: boolean;
}

class UpdateOfferDto extends OfferDto {
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
}

class OffersQueryDto {
  @IsOptional() @IsIn(ESTADOS) estado?: EstadoOferta;
  @IsOptional() @IsIn(TIPOS) tipo?: TipoOferta;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsISO8601() desde?: string;
  @IsOptional() @IsISO8601() hasta?: string;
}

@Controller("organizations/:organizationId/offers")
@UseGuards(JwtAccessGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  listar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: OffersQueryDto,
  ) {
    return this.offers.listar(request.auth!.sub, organizationId, query);
  }

  /** Activas y programadas, listas para el motor de Ventas y Productos. */
  @Get("vigentes")
  vigentes(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.offers.vigentes(request.auth!.sub, organizationId);
  }

  @Get("reporte")
  reporte(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: OffersQueryDto,
  ) {
    return this.offers.reporte(request.auth!.sub, organizationId, query);
  }

  @Get(":offerId")
  detalle(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
  ) {
    return this.offers.detalle(request.auth!.sub, organizationId, offerId);
  }

  @Post()
  crear(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateOfferDto,
  ) {
    return this.offers.crear(request.auth!.sub, organizationId, body);
  }

  @Put(":offerId")
  editar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @Body() body: UpdateOfferDto,
  ) {
    return this.offers.editar(request.auth!.sub, organizationId, offerId, body);
  }

  @Post(":offerId/duplicar")
  duplicar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
  ) {
    return this.offers.duplicar(request.auth!.sub, organizationId, offerId);
  }

  @Post(":offerId/:accion")
  cambiarEstado(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @Param("accion") accion: string,
  ) {
    const acciones: AccionOferta[] = [
      "publicar",
      "pausar",
      "reanudar",
      "finalizar",
      "archivar",
    ];
    const elegida = acciones.find((item) => item === accion);
    if (!elegida) throw new NotFoundException("Acción desconocida.");
    return this.offers.cambiarEstado(
      request.auth!.sub,
      organizationId,
      offerId,
      elegida,
    );
  }
}
