import {
  Controller,
  Body,
  Post,
  NotFoundException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { CatalogService } from "./catalog.service";
import { ExternalCatalogService } from "./external-catalog.service";
import { hasCategoryConflict } from "./category-classification";
import { IsString, MaxLength, MinLength } from "class-validator";

class SelectExternalCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fingerprint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  source!: string;
}

@Controller("organizations/:organizationId/catalog/external-products")
@UseGuards(JwtAccessGuard)
export class ExternalCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly external: ExternalCatalogService,
  ) {}

  @Post("barcode/:code/category")
  async category(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("code") code: string,
    @Body() input: SelectExternalCategoryDto,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_MANAGE",
    );
    const result = await this.external.lookup(code, organizationId);
    const candidate = [
      ...result.reference,
      ...result.openBeauty.candidates,
    ].find(
      (row) =>
        row.fingerprint === input.fingerprint && row.source === input.source,
    );
    if (!candidate)
      throw new NotFoundException(
        "La ficha cambió. Consultá nuevamente el código.",
      );
    // A package-size disagreement does not erase the explicit category of the
    // selected source. Identity/type conflicts still require manual selection.
    const evidence = hasCategoryConflict(candidate.review_reason)
      ? await this.external.categoryEvidence(
          code,
          organizationId,
          candidate.source,
          candidate.fingerprint,
        )
      : undefined;
    return this.catalog.resolveExternalCategory(
      request.auth!.sub,
      organizationId,
      candidate.category_path ?? [],
      candidate.scope_group,
      {
        name: candidate.name,
        ...(candidate.presentation
          ? { presentation: candidate.presentation }
          : {}),
        subcategory: candidate.subcategory,
        review_reason: candidate.review_reason,
        evidence,
      },
    );
  }

  @Get("barcode/:code")
  @Header("Cache-Control", "no-store")
  async lookup(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("code") code: string,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      organizationId,
      "CATALOG_MANAGE",
    );
    return this.external.lookup(code, organizationId);
  }
}
