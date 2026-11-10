import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type, plainToInstance } from "class-transformer";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@gestion/contracts";
import { PriceChangeDto } from "./price-list-updates";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  ValidateIf,
  ValidateNested,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  validate,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { DecidedWhenOccurred } from "../platform/subscription-gate";
import {
  BranchProductChangeDto,
  CreateProductDto,
  UpdateProductDto,
} from "./catalog.controller";
import { CatalogOfflineService } from "./catalogo-sin-conexion.service";
import type { OperacionCatalogoSinConexion } from "./producto-sin-conexion";

// Productos sin conexión (SISTEMA-79): cada operación se valida con el mismo
// DTO que con conexión, según su tipo.

class CodigoOfflineDto {
  @IsString() @MinLength(1) @MaxLength(64) code!: string;
}
class EliminarOfflineDto {}
class OpcionOfflineDto {
  @IsIn(["categories", "laboratories"]) type!: "categories" | "laboratories";
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsIn(CATEGORY_ICONS) icon?: string;
  @IsOptional() @IsIn(CATEGORY_COLORS) color?: string;
}
// Categorías, laboratorios y listas de precios (SISTEMA-80).
class OpcionEdicionOfflineDto {
  @IsIn(["categories", "laboratories"]) type!: "categories" | "laboratories";
  @IsUUID() id!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
}
class OpcionBajaOfflineDto {
  @IsIn(["categories", "laboratories"]) type!: "categories" | "laboratories";
  @IsUUID() id!: string;
}
class IconoOfflineDto {
  @IsUUID() id!: string;
  @IsIn(CATEGORY_ICONS) icon!: string;
  @IsOptional() @IsIn(CATEGORY_COLORS) color?: string;
}
class LogoOfflineDto {
  @IsUUID() id!: string;
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(82000)
  dataUrl!: string | null;
}
class ListaAltaOfflineDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsBoolean() includeAll?: boolean;
}
class ListaEdicionOfflineDto {
  @IsUUID() priceListId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() fallbackPriceListId?: string | null;
}
class ListaPreciosOfflineDto {
  @IsUUID() priceListId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PriceChangeDto)
  changes!: PriceChangeDto[];
}
const CUERPO_CATALOGO = {
  ALTA: CreateProductDto,
  EDICION: UpdateProductDto,
  ESTADO_SUCURSAL: BranchProductChangeDto,
  CODIGO_AGREGAR: CodigoOfflineDto,
  CODIGO_QUITAR: CodigoOfflineDto,
  ELIMINAR: EliminarOfflineDto,
  OPCION: OpcionOfflineDto,
  OPCION_EDICION: OpcionEdicionOfflineDto,
  OPCION_BAJA: OpcionBajaOfflineDto,
  OPCION_ICONO: IconoOfflineDto,
  LOGO: LogoOfflineDto,
  LISTA_ALTA: ListaAltaOfflineDto,
  LISTA_EDICION: ListaEdicionOfflineDto,
  LISTA_PRECIOS: ListaPreciosOfflineDto,
} as const;
const CON_PRODUCTO: readonly string[] = [
  "EDICION",
  "ESTADO_SUCURSAL",
  "CODIGO_AGREGAR",
  "CODIGO_QUITAR",
  "ELIMINAR",
];

class OfflineCatalogDto {
  @IsIn(Object.keys(CUERPO_CATALOGO))
  tipo!: OperacionCatalogoSinConexion["tipo"];
  @IsOptional() @IsUUID() productId?: string;
  @IsUUID() clientOperationId!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
  /** El mismo cuerpo que con conexión, en el formato de su tipo. */
  @IsObject() cuerpo!: Record<string, unknown>;
}
class SignedOfflineCatalogDto {
  @IsUUID() actorId!: string;
  @IsUUID() deviceId!: string;
  // Puede llevar la foto del producto.
  @IsString() @MaxLength(150000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}

async function operacionDeCatalogo(
  datos: unknown,
): Promise<OperacionCatalogoSinConexion> {
  const opciones = { whitelist: true, forbidNonWhitelisted: true };
  const op = plainToInstance(OfflineCatalogDto, datos ?? {});
  const DTO = CUERPO_CATALOGO[op.tipo] as (new () => object) | undefined;
  const cuerpo = DTO ? plainToInstance(DTO, op.cuerpo ?? {}) : null;
  if (
    (await validate(op, opciones)).length ||
    !cuerpo ||
    (await validate(cuerpo, opciones)).length ||
    (CON_PRODUCTO.includes(op.tipo) && !op.productId)
  )
    throw new BadRequestException(
      "El producto guardado sin conexión tiene datos inválidos.",
    );
  return { ...op, cuerpo } as unknown as OperacionCatalogoSinConexion;
}

@Controller("organizations/:organizationId/branches/:branchId/catalog")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class CatalogOfflineController {
  constructor(private readonly offline: CatalogOfflineService) {}
  /** Operación de productos hecha sin conexión, que la PC manda al volver. */
  @DecidedWhenOccurred()
  @Post("offline")
  async offlineOperation(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: OfflineCatalogDto,
  ) {
    return this.offline.catalogOffline(
      req.auth!.sub,
      org,
      branch,
      await operacionDeCatalogo(body),
    );
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async offlineSigned(
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: SignedOfflineCatalogDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La operación firmada no se puede leer.");
    }
    const op = await operacionDeCatalogo(datos);
    if (op.deviceId !== body.deviceId)
      throw new BadRequestException("La operación no corresponde a esa PC.");
    return this.offline.catalogOfflineSigned(
      req.auth!.sub,
      org,
      branch,
      body,
      op,
    );
  }
}
