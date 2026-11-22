import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsUUID, Matches } from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { GRUPOS, type GrupoPedidos, type OrigenPedido } from "./pedidos-reglas";
import { PedidosService } from "./pedidos.service";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ORIGENES: OrigenPedido[] = ["catalogo", "preventa"];

class FiltroPedidosDto {
  @IsOptional() @IsIn(GRUPOS) grupo?: GrupoPedidos;
  @IsOptional() @IsIn(ORIGENES) origen?: OrigenPedido;
  @IsOptional() @Matches(FECHA) desde?: string;
  @IsOptional() @Matches(FECHA) hasta?: string;
  @IsOptional() @IsUUID() vendedor?: string;
}

class VistaDto {
  @IsBoolean() unificados!: boolean;
}

/** Pedidos del catálogo online y de preventa en una sola pantalla (SISTEMA-119). */
@Controller("organizations/:organizationId/pedidos")
@UseGuards(JwtAccessGuard)
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  listar(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Query() query: FiltroPedidosDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pedidos.listar(request.auth!.sub, organizationId, {
      grupo: query.grupo,
      origen: query.origen,
      desde: query.desde,
      hasta: query.hasta,
      vendedorId: query.vendedor,
    });
  }

  @Put("vista")
  cambiarVista(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: VistaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pedidos.cambiarVista(
      request.auth!.sub,
      organizationId,
      body.unificados,
    );
  }
}
