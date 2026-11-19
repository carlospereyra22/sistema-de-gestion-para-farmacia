import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { EquivalentesService } from "./equivalentes.service";

class EquivalentesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,14}(,\d{8,14}){0,19}$/)
  codigos?: string;

  @IsOptional() @IsString() @MaxLength(200) principioActivo?: string;
  @IsOptional() @IsString() @MaxLength(120) forma?: string;
  @IsOptional() @IsString() @MaxLength(60) concentracion?: string;
  @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(200) presentacion?: string;
}

// Equivalentes y otros productos con la misma droga (SISTEMA-108).
@Controller(
  "organizations/:organizationId/branches/:branchId/catalog/equivalentes",
)
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class EquivalentesController {
  constructor(private readonly equivalentes: EquivalentesService) {}

  @Get()
  buscar(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Query() query: EquivalentesQueryDto,
  ) {
    return this.equivalentes.buscar(
      request.auth!.sub,
      organizationId,
      branchId,
      {
        codigos: query.codigos ? query.codigos.split(",") : [],
        principioActivo: query.principioActivo,
        forma: query.forma,
        concentracion: query.concentracion,
        nombre: query.nombre,
        presentacion: query.presentacion,
      },
    );
  }
}
