import {
  Controller,
  BadRequestException,
  Body,
  Get,
  Header,
  Param,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  MaxLength,
} from "class-validator";
import { AlfaBetaService } from "./alfabeta.service";

class AlfaBetaQueryDto {
  @IsString() @MinLength(2) @MaxLength(120) q!: string;
}

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { CatalogService } from "./catalog.service";
import { MedicineCatalogService } from "./medicine-catalog.service";
import { MedicineReferenceService } from "./medicine-reference.service";
import { ExternalCatalogService } from "./external-catalog.service";

class MedicinePackQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{8,14}(,\d{8,14}){0,99}$/)
  codes?: string;
}

class MedicinePackDto {
  @IsString() @Matches(/^\d{8,14}$/) baseBarcode!: string;
  @IsInt() @Min(2) @Max(1000) factor!: number;
}

class MedicineReferenceQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @IsIn(["official", "preciosderemedios"])
  source?: "official" | "preciosderemedios";
}

@Controller("organizations/:organizationId/catalog/medicine-references")
@UseGuards(JwtAccessGuard)
export class MedicineReferenceController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly references: MedicineReferenceService,
    private readonly alfabeta: AlfaBetaService,
    private readonly externalCatalog: ExternalCatalogService,
    private readonly medicineCatalog: MedicineCatalogService,
  ) {}

  @Get("barcode/:code")
  @Header("Cache-Control", "no-store")
  async barcode(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("code") code: string,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_MANAGE",
    );
    // Primero la base propia. Una coincidencia única se vincula sola.
    const catalogMatches = await this.medicineCatalog.byBarcode(code);
    if (catalogMatches.length)
      return {
        matches: catalogMatches,
        retailMatches: [],
        automaticSelection: catalogMatches.length === 1,
        officialUnavailable: false,
      };
    let matches: Awaited<ReturnType<MedicineReferenceService["byBarcode"]>> =
      [];
    let officialUnavailable = false;
    try {
      matches = await this.references.byBarcode(code);
    } catch {
      officialUnavailable = true;
    }
    if (matches.length)
      return {
        matches,
        retailMatches: [],
        automaticSelection: matches.length === 1,
        officialUnavailable,
      };
    let retailMatches: Awaited<
      ReturnType<ExternalCatalogService["medicineFallback"]>
    > = [];
    try {
      retailMatches = await this.externalCatalog.medicineFallback(
        code,
        organizationId,
      );
    } catch {
      if (officialUnavailable)
        throw new ServiceUnavailableException(
          "No se pudo consultar ninguna fuente de medicamentos.",
        );
    }
    return {
      matches,
      retailMatches,
      automaticSelection: false,
      officialUnavailable,
    };
  }

  @Get("packs")
  async packs(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Query() query: MedicinePackQueryDto,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_READ",
    );
    return this.medicineCatalog.packs(query.codes?.split(","));
  }

  @Put("packs/:barcode")
  async savePack(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("barcode") barcode: string,
    @Body() body: MedicinePackDto,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_MANAGE",
    );
    if (!/^\d{8,14}$/.test(barcode))
      throw new BadRequestException("Revisá el código del exhibidor.");
    return this.medicineCatalog.savePack(request.auth!.sub, organizationId, {
      barcode,
      baseBarcode: body.baseBarcode,
      factor: body.factor,
    });
  }

  @Get("alfabeta")
  async searchAlfaBeta(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Query() query: AlfaBetaQueryDto,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_READ",
    );
    return this.alfabeta.search(query.q);
  }

  @Get("alfabeta/:id")
  async alfaBetaDetail(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_READ",
    );
    return this.alfabeta.detail(id);
  }

  @Get()
  async search(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Query() query: MedicineReferenceQueryDto,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_MANAGE",
    );
    const source = query.source ?? "official";
    // La opción general busca en la base propia; el padrón queda de respaldo
    // para lo que todavía no está cargado.
    if (source === "official") {
      const found = await this.medicineCatalog.search(query.q);
      if (found.length) return found;
    }
    return this.references.search(query.q, source);
  }
}
