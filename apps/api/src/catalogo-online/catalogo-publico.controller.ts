import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
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
import type { Request, Response } from "express";

import { LimiteDeLogin } from "../auth/limite-login";
import { CatalogoPublicoService } from "./catalogo-publico.service";
import {
  COOKIE_PORTAL,
  DURACION_SESION_PORTAL_MS,
  RUTA_COOKIE_PORTAL,
} from "./portal-sesion";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

class FiltroProductosDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsUUID() categoria?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pagina?: number;
  /** Sólo productos con alguna oferta vigente (apartado Ofertas). */
  @IsOptional() @IsIn(["1"]) ofertas?: "1";
  /** Productos puntuales (los del carrito), separados por coma. Hasta 100. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,99}$/i)
  ids?: string;
}

class IngresoDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}

class RenglonDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity!: number;
}

class CotizacionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RenglonDto)
  items!: RenglonDto[];
}

class PedidoDto {
  @IsUUID() requestId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RenglonDto)
  items!: RenglonDto[];
  @IsIn(["PICKUP", "DELIVERY"]) delivery!: "PICKUP" | "DELIVERY";
  @IsOptional() @IsString() @MaxLength(200) deliveryAddress?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,15}$/) expectedTotalMinor?: string;
}

/** Valida la dirección pública antes de ir a la base. */
function slugDe(valor: string): string {
  return SLUG.test(valor) && valor.length <= 60 ? valor : "-";
}

/**
 * Rutas públicas del catálogo online (SISTEMA-107). No usan la sesión de la
 * farmacia: el cliente se identifica con la cookie del portal.
 */
@Controller("catalogo/:slug")
export class CatalogoPublicoController {
  constructor(
    private readonly catalogo: CatalogoPublicoService,
    private readonly limite: LimiteDeLogin,
  ) {}

  private cookie(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)?.[
      COOKIE_PORTAL
    ];
  }

  @Get()
  portada(@Param("slug") slug: string, @Req() request: Request) {
    return this.catalogo.portada(slugDe(slug), this.cookie(request));
  }

  @Get("productos")
  productos(
    @Param("slug") slug: string,
    @Query() query: FiltroProductosDto,
    @Req() request: Request,
  ) {
    return this.catalogo.productos(slugDe(slug), this.cookie(request), {
      ...query,
      ids: query.ids?.split(","),
      soloOfertas: query.ofertas === "1",
    });
  }

  @Get("categorias")
  categorias(@Param("slug") slug: string, @Req() request: Request) {
    return this.catalogo.categorias(slugDe(slug), this.cookie(request));
  }

  @Get("productos/:productId/imagen")
  async imagen(
    @Param("slug") slug: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contenido = await this.catalogo.imagen(
      slugDe(slug),
      this.cookie(request),
      productId,
    );
    // La página del catálogo puede estar en otro origen que la API (en la PC,
    // 5173 y 3000): helmet manda same-origin y el navegador no mostraría la foto.
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Con versión (?v=) la foto no cambia en esa dirección: se guarda un día.
    response.setHeader(
      "Cache-Control",
      typeof request.query.v === "string"
        ? "private, max-age=86400"
        : "private, no-cache",
    );
    return new StreamableFile(contenido, { type: "image/jpeg" });
  }

  @Get("logo")
  async logo(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const contenido = await this.catalogo.logo(slugDe(slug));
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.setHeader("Cache-Control", "public, max-age=300");
    return new StreamableFile(contenido, { type: "image/jpeg" });
  }

  @Post("ingresar")
  @HttpCode(200)
  async ingresar(
    @Param("slug") slug: string,
    @Body() body: IngresoDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const clave = `catalogo:${slug}:${body.email}`;
    this.limite.comprobar(clave);
    let valor: string;
    try {
      valor = await this.catalogo.ingresar(
        slugDe(slug),
        body.email,
        body.password,
      );
    } catch (error) {
      this.limite.registrarFallo(clave);
      throw error;
    }
    this.limite.registrarExito(clave);
    response.cookie(COOKIE_PORTAL, valor, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: RUTA_COOKIE_PORTAL,
      maxAge: DURACION_SESION_PORTAL_MS,
    });
    return this.catalogo.portada(slugDe(slug), valor);
  }

  @Post("salir")
  @HttpCode(204)
  async salir(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.catalogo.salir(this.cookie(request));
    response.clearCookie(COOKIE_PORTAL, { path: RUTA_COOKIE_PORTAL });
  }

  /** Precios y ofertas del carrito, calculados por el servidor. */
  @Post("cotizar")
  @HttpCode(200)
  cotizar(
    @Param("slug") slug: string,
    @Body() body: CotizacionDto,
    @Req() request: Request,
  ) {
    return this.catalogo.cotizar(
      slugDe(slug),
      this.cookie(request),
      body.items,
    );
  }

  @Get("pedidos")
  misPedidos(@Param("slug") slug: string, @Req() request: Request) {
    return this.catalogo.misPedidos(slugDe(slug), this.cookie(request));
  }

  @Post("pedidos")
  crearPedido(
    @Param("slug") slug: string,
    @Body() body: PedidoDto,
    @Req() request: Request,
  ) {
    return this.catalogo.crearPedido(slugDe(slug), this.cookie(request), body);
  }

  @Get("pedidos/:orderId")
  miPedido(
    @Param("slug") slug: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Req() request: Request,
  ) {
    return this.catalogo.miPedido(slugDe(slug), this.cookie(request), orderId);
  }

  @Post("pedidos/:orderId/cancelar")
  @HttpCode(200)
  cancelar(
    @Param("slug") slug: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Req() request: Request,
  ) {
    return this.catalogo.cancelar(slugDe(slug), this.cookie(request), orderId);
  }
}
