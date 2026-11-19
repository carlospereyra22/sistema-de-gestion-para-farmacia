import {
  Body,
  Controller,
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
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
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
import { PreventaComisionesService } from "./preventa-comisiones.service";
import { PreventaPedidosService } from "./preventa-pedidos.service";
import type { EfectoEntrega, EstadoPreventa } from "./preventa-reglas";
import { PreventaService } from "./preventa.service";

const ESTADOS: EstadoPreventa[] = [
  "PENDING",
  "IN_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];
const EFECTOS: EfectoEntrega[] = ["NONE", "STOCK", "SALE"];
const MEDIOS = ["CASH", "TRANSFER", "CARD"] as const;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CENTAVOS = /^\d{1,15}$/;

class ConfiguracionDto {
  @IsUUID() branchId!: string;
  @IsIn(EFECTOS) deliveryEffect!: EfectoEntrega;
  @IsBoolean() sellerCanChangePrice!: boolean;
  @IsBoolean() sellerSeesAllCustomers!: boolean;
  @IsBoolean() showStock!: boolean;
  @IsBoolean() allowOutOfStock!: boolean;
  @IsBoolean() applyOffers!: boolean;
  @IsOptional() @IsString() @MaxLength(300) receiptNote?: string | null;
}

class ComisionDto {
  @IsInt() @Min(0) @Max(10_000) commissionRateBps!: number;
}

class ComisionPedidoDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000) commissionRateBps!: number | null;
}

class FiltroClientesDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(["1"]) hoy?: "1";
  @IsOptional() @IsUUID() vendedor?: string;
}

class DatosClienteDto {
  @IsOptional() @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @IsString() @MaxLength(300) reference?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(127) visitDays?: number;
  @IsOptional() @IsUUID() sellerId?: string | null;
}

class ClienteNuevoDto extends DatosClienteDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(40) document?: string | null;
}

class FiltroProductosDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() cliente?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pagina?: number;
  @IsOptional() @IsIn(["1"]) ofertas?: "1";
  @IsOptional() @IsIn(["1"]) conStock?: "1";
  @IsOptional() @IsString() @MaxLength(7400) ids?: string;
}

class RenglonDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(9999) quantity!: number;
  @IsOptional() @IsString() @Matches(CENTAVOS) unitPriceMinor?: string;
}

class CotizarDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RenglonDto)
  items!: RenglonDto[];
}

class PedidoDto {
  @IsUUID() requestId!: string;
  @IsUUID() customerId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RenglonDto)
  items!: RenglonDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

class EdicionDto {
  @IsString() expectedUpdatedAt!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RenglonDto)
  items!: RenglonDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

class FiltroPedidosDto {
  @IsOptional() @IsIn(ESTADOS) estado?: EstadoPreventa;
  @IsOptional() @IsUUID() vendedor?: string;
  @IsOptional() @IsUUID() repartidor?: string;
  @IsOptional() @IsUUID() cliente?: string;
  @IsOptional() @Matches(FECHA) desde?: string;
  @IsOptional() @Matches(FECHA) hasta?: string;
  @IsOptional() @IsIn(["1"]) mios?: "1";
  @IsOptional() @IsIn(["1"]) repartir?: "1";
}

class CancelarDto {
  @IsIn(ESTADOS) expectedStatus!: EstadoPreventa;
  @IsString() @MinLength(1) @MaxLength(300) reason!: string;
}

class DevolverDto {
  @IsIn(ESTADOS) expectedStatus!: EstadoPreventa;
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

class AsignarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  orderIds!: string[];
  @IsUUID() delivererId!: string;
}

class EntregaDto {
  @IsIn(ESTADOS) expectedStatus!: EstadoPreventa;
  @IsUUID() requestId!: string;
  @IsString() @Matches(CENTAVOS) collectedMinor!: string;
  @IsOptional() @IsIn(MEDIOS) method?: (typeof MEDIOS)[number];
}

class CobroDto {
  @IsUUID() requestId!: string;
  @IsString() @Matches(CENTAVOS) amountMinor!: string;
  @IsIn(MEDIOS) method!: (typeof MEDIOS)[number];
}

class FiltroComisionesDto {
  @IsOptional() @Matches(FECHA) desde?: string;
  @IsOptional() @Matches(FECHA) hasta?: string;
  @IsOptional() @IsUUID() vendedor?: string;
}

class PagoComisionDto {
  @IsUUID() requestId!: string;
  @IsUUID() sellerId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID("all", { each: true })
  orderIds!: string[];
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

class ResumenDto {
  @Matches(FECHA) desde!: string;
  @Matches(FECHA) hasta!: string;
}

/**
 * Preventa (SISTEMA-108), bajo `organizations/:organizationId/preventa`. Cada
 * operación verifica el módulo y el permiso (vender, repartir o administrar).
 */
@Controller("organizations/:organizationId/preventa")
@UseGuards(JwtAccessGuard)
export class PreventaController {
  constructor(
    private readonly preventa: PreventaService,
    private readonly pedidos: PreventaPedidosService,
    private readonly comisiones: PreventaComisionesService,
  ) {}

  @Get("contexto")
  contexto(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.preventa.contexto(request.auth!.sub, organizationId);
  }

  @Get("configuracion")
  configuracion(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.preventa.configuracion(request.auth!.sub, organizationId);
  }

  @Put("configuracion")
  guardarConfiguracion(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: ConfiguracionDto,
  ) {
    return this.preventa.guardarConfiguracion(
      request.auth!.sub,
      organizationId,
      body,
    );
  }

  @Get("equipo")
  equipo(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.preventa.equipo(request.auth!.sub, organizationId);
  }

  @Put("equipo/:userId/comision")
  comisionDelVendedor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: ComisionDto,
  ) {
    return this.preventa.cambiarComisionDelVendedor(
      request.auth!.sub,
      organizationId,
      userId,
      body.commissionRateBps,
    );
  }

  @Get("clientes")
  clientes(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: FiltroClientesDto,
  ) {
    return this.preventa.clientes(request.auth!.sub, organizationId, {
      q: query.q,
      hoy: query.hoy === "1",
      vendedorId: query.vendedor,
    });
  }

  @Post("clientes")
  crearCliente(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: ClienteNuevoDto,
  ) {
    return this.preventa.crearCliente(request.auth!.sub, organizationId, body);
  }

  @Put("clientes/:customerId")
  guardarCliente(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Body() body: DatosClienteDto,
  ) {
    return this.preventa.guardarCliente(
      request.auth!.sub,
      organizationId,
      customerId,
      body,
    );
  }

  @Get("productos")
  productos(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: FiltroProductosDto,
  ) {
    return this.preventa.productos(request.auth!.sub, organizationId, {
      q: query.q,
      clienteId: query.cliente,
      pagina: query.pagina,
      soloOfertas: query.ofertas === "1",
      soloConStock: query.conStock === "1",
      ids: query.ids
        ?.split(",")
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
        .slice(0, 200),
    });
  }

  @Get("ofertas")
  ofertas(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.preventa.ofertas(request.auth!.sub, organizationId);
  }

  @Post("cotizar")
  cotizar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CotizarDto,
  ) {
    return this.preventa.cotizar(request.auth!.sub, organizationId, body);
  }

  @Get("pedidos")
  listar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: FiltroPedidosDto,
  ) {
    return this.pedidos.listar(request.auth!.sub, organizationId, {
      estado: query.estado,
      vendedorId: query.vendedor,
      repartidorId: query.repartidor,
      clienteId: query.cliente,
      desde: query.desde,
      hasta: query.hasta,
      mios: query.mios === "1",
      paraRepartir: query.repartir === "1",
    });
  }

  @Post("pedidos")
  crear(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: PedidoDto,
  ) {
    return this.pedidos.crear(request.auth!.sub, organizationId, body);
  }

  @Post("pedidos/asignar")
  asignar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: AsignarDto,
  ) {
    return this.pedidos.asignar(request.auth!.sub, organizationId, body);
  }

  @Get("pedidos/:orderId")
  detalle(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.pedidos.detalle(request.auth!.sub, organizationId, orderId);
  }

  @Put("pedidos/:orderId")
  editar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: EdicionDto,
  ) {
    return this.pedidos.editar(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
    );
  }

  @Post("pedidos/:orderId/cancelar")
  cancelar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: CancelarDto,
  ) {
    return this.pedidos.cancelar(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
    );
  }

  @Post("pedidos/:orderId/quitar-del-reparto")
  quitarDelReparto(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: DevolverDto,
  ) {
    return this.pedidos.devolverAPendiente(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
      "quitarDelReparto",
    );
  }

  @Post("pedidos/:orderId/no-entregado")
  noEntregado(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: DevolverDto,
  ) {
    return this.pedidos.devolverAPendiente(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
      "noEntregado",
    );
  }

  @Post("pedidos/:orderId/entregar")
  entregar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: EntregaDto,
  ) {
    return this.pedidos.entregar(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
    );
  }

  @Post("pedidos/:orderId/cobros")
  cobrar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: CobroDto,
  ) {
    return this.pedidos.cobrar(
      request.auth!.sub,
      organizationId,
      orderId,
      body,
    );
  }

  @Put("pedidos/:orderId/comision")
  comisionDelPedido(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body() body: ComisionPedidoDto,
  ) {
    return this.comisiones.cambiarComisionDelPedido(
      request.auth!.sub,
      organizationId,
      orderId,
      body.commissionRateBps ?? null,
    );
  }

  @Get("comisiones")
  listarComisiones(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: FiltroComisionesDto,
  ) {
    return this.comisiones.comisiones(request.auth!.sub, organizationId, {
      desde: query.desde,
      hasta: query.hasta,
      vendedorId: query.vendedor,
    });
  }

  @Post("comisiones/pagar")
  pagarComisiones(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: PagoComisionDto,
  ) {
    return this.comisiones.pagar(request.auth!.sub, organizationId, body);
  }

  @Get("resumen")
  resumen(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ResumenDto,
  ) {
    return this.comisiones.resumen(request.auth!.sub, organizationId, query);
  }
}
