import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformPadronService } from "./platform-padron.service";

class EnvironmentDto {
  @IsIn(["HOMOLOGATION", "PRODUCTION"]) environment!: string;
}
class PrepararDto extends EnvironmentDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: "El CUIT tiene que tener 11 números." })
  cuit!: string;
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsBoolean() replace?: boolean;
}
class CargarDto extends EnvironmentDto {
  @IsString() @MaxLength(24000) certificate!: string;
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
}

/** Certificado de Farmatec para el padrón de ARCA (SISTEMA-70). */
@Controller("platform/padron-certificado")
@UseGuards(PlatformAdminGuard)
export class PlatformPadronController {
  constructor(private readonly padron: PlatformPadronService) {}

  @Get() @Header("Cache-Control", "no-store") estado(
    @Query() query: EnvironmentDto,
  ) {
    return this.padron.estado(query.environment);
  }

  @Get("solicitud") @Header("Cache-Control", "no-store") solicitud(
    @Query() query: EnvironmentDto,
  ) {
    return this.padron.solicitud(query.environment);
  }

  @Post("solicitud") @Header("Cache-Control", "no-store") preparar(
    @Req() request: AuthenticatedRequest,
    @Body() body: PrepararDto,
  ) {
    return this.padron.preparar(request.auth!.sub, body);
  }

  @Post("certificado") @Header("Cache-Control", "no-store") cargar(
    @Req() request: AuthenticatedRequest,
    @Body() body: CargarDto,
  ) {
    return this.padron.cargar(request.auth!.sub, body);
  }
}
