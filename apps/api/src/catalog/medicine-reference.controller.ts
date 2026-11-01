import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsOptional,
  IsString,
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
import { MedicineReferenceService } from "./medicine-reference.service";
import { ExternalCatalogService } from "./external-catalog.service";

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
    return this.references.search(query.q, query.source ?? "official");
  }
}
