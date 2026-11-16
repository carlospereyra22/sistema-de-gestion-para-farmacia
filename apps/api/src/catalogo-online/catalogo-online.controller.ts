import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  type PipeTransform,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { EstadoPedido } from "./catalogo-reglas";
import {
  CatalogoOnlineService,
  type DecisionPedido,
} from "./catalogo-online.service";

const ESTADOS: EstadoPedido[] = [
  "RECEIVED",
  "CONFIRMED",
  "REJECTED",
  "DELIVERED",
  "CANCELLED",
];
const DECISIONES: DecisionPedido[] = ["confirmar", "rechazar", "entregar"];

class ConfiguracionDto {
  @IsString() @MinLength(3) @MaxLength(60) slug!: string;
  @IsUUID() branchId!: string;
  @IsBoolean() published!: boolean;
  @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
  @IsBoolean() requireLogin!: boolean;
  @IsBoolean() showPricesPublic!: boolean;
  @IsBoolean() showOutOfStock!: boolean;
  @IsOptional() @IsUUID() priceListId!: string | null;
  @IsBoolean() pickupEnabled!: boolean;
  @IsBoolean() deliveryEnabled!: boolean;
  @IsBoolean() deductStockOnDelivery!: boolean;
}

class UsuarioNuevoDto {
  @IsUUID() customerId!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
}

class CambioUsuarioDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string;
}

class FiltroPedidosDto {
  @IsOptional() @IsIn(ESTADOS) estado?: EstadoPedido;
}

class DecisionDto {
  @IsIn(ESTADOS) expectedStatus!: EstadoPedido;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class ParseDecisionPipe implements PipeTransform<string, DecisionPedido> {
  transform(value: string): DecisionPedido {
    if (!(DECISIONES as string[]).includes(value))
      throw new BadRequestException("Acción de pedido desconocida.");
    return value as DecisionPedido;
  }
}

/** Catálogo online desde la gestión de la farmacia (SISTEMA-107). */
@Controller("organizations/:organizationId/catalogo-online")
@UseGuards(JwtAccessGuard)
export class CatalogoOnlineController {
  constructor(private readonly catalogo: CatalogoOnlineService) {}

  @Get("configuracion")
  configuracion(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.configuracion(request.auth!.sub, organizationId);
  }

  @Put("configuracion")
  guardarConfiguracion(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: ConfiguracionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.guardarConfiguracion(
      request.auth!.sub,
      organizationId,
      {
        ...body,
        priceListId: body.priceListId ?? null,
      },
    );
  }

  @Get("usuarios")
  usuarios(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.usuarios(request.auth!.sub, organizationId);
  }

  @Post("usuarios")
  crearUsuario(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: UsuarioNuevoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.crearUsuario(request.auth!.sub, organizationId, body);
  }

  @Patch("usuarios/:userId")
  cambiarUsuario(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: CambioUsuarioDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.cambiarUsuario(
      request.auth!.sub,
      organizationId,
      userId,
      body,
    );
  }

  @Get("pedidos")
  pedidos(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: FiltroPedidosDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.pedidos(request.auth!.sub, organizationId, query);
  }

  @Post("pedidos/:orderId/:accion")
  decidir(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Param("accion", new ParseDecisionPipe()) accion: DecisionPedido,
    @Body() body: DecisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogo.decidir(
      request.auth!.sub,
      organizationId,
      orderId,
      accion,
      body,
    );
  }
}
