import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsUUID,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
  Matches,
  Max,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { partesPedidas } from "./catalogo-por-partes";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { CatalogPriceRefreshService } from "./catalog-price-refresh.service";
import { CatalogService } from "./catalog.service";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  type CategoryIcon,
  type CategoryColor,
} from "@gestion/contracts";
import {
  PriceListUpdates,
  PriceChangesDto,
  PricePreviewDto,
} from "./price-list-updates";
import { AllowWhenReadOnly } from "../platform/subscription-gate";
type SaleUnitValue = "BOX" | "BLISTER" | "UNIT";
class EquivalentBarcodeDto {
  @IsString() @MinLength(8) @MaxLength(14) code!: string;
}
export class CreateProductDto {
  @IsOptional() @IsBoolean() generateInternalBarcode?: boolean;
  @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @IsOptional() @IsBoolean() isMedication?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) priceDivisor?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) priceMarkupBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(999999999999) priceBaseMinor?:
    number | null;
  @IsOptional() @IsString() @MaxLength(82000) imageDataUrl?: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() laboratoryId?: string;
  @IsOptional() @IsString() @MinLength(2) laboratoryName?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsInt() @Min(0) priceMinor!: number;
  @IsOptional() @IsString() activeIngredient?: string;
  @IsOptional() @IsString() pharmaceuticalForm?: string;
  @IsOptional() @IsString() concentration?: string;
  @IsOptional() @IsString() presentation?: string;
  @IsOptional()
  @IsIn(["official", "preciosderemedios", "alfabeta"])
  externalReferenceSource?: "official" | "preciosderemedios" | "alfabeta";
  @IsOptional() @IsString() @MinLength(2) externalReferenceName?: string;
  @IsOptional() @IsString() externalReferencePresentation?: string;
  @IsOptional() @IsString() externalReferenceBarcode?: string;
  @IsOptional() @IsInt() @Min(0) externalReferencePriceMinor?: number;
  @IsOptional() @IsIn(["BOX", "BLISTER", "UNIT"]) saleUnit?: SaleUnitValue;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() prescriptionRequired?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(14, { each: true })
  equivalentBarcodes?: string[];
}
class LaboratoryLogoDto {
  @IsString() @MaxLength(82000) dataUrl!: string;
}
class CreateNamedCatalogItemDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
class CreateCategoryDto extends CreateNamedCatalogItemDto {
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsIn(CATEGORY_COLORS) color?: CategoryColor;
  @IsOptional() @IsIn(CATEGORY_ICONS) icon?: CategoryIcon;
}
class CategoryIconDto {
  @IsOptional() @IsIn(CATEGORY_COLORS) color?: CategoryColor;
  @IsIn(CATEGORY_ICONS) icon!: CategoryIcon;
}
class CreatePriceListDto extends CreateNamedCatalogItemDto {
  @IsOptional() @IsBoolean() includeAll?: boolean;
}
class UpdatePriceListDto extends CreateNamedCatalogItemDto {
  @IsOptional() @IsUUID() fallbackPriceListId?: string | null;
}
class SetPriceDto {
  @IsInt() @Min(0) amountMinor!: number;
}
class UpdateProductStatusDto {
  @IsBoolean() active!: boolean;
}
export class BranchProductChangeDto {
  @IsOptional() @IsDateString() expectedUpdatedAt?: string | null;
  @IsIn(["ACTIVE", "ARCHIVED", "DELETED"]) status!:
    "ACTIVE" | "ARCHIVED" | "DELETED";
  @IsIn(["ACTIVE", "ARCHIVED", "DELETED"]) expectedStatus!:
    "ACTIVE" | "ARCHIVED" | "DELETED";
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @IsOptional() @IsInt() @Min(0) expectedStock?: number;
  @IsOptional() @IsBoolean() confirmStockWriteOff?: boolean;
}
class CatalogBranchQuery {
  @IsOptional() @IsUUID() branchId?: string;
}
/** Catálogo por partes (SISTEMA-74): versión del diccionario que tiene la PC. */
class CatalogVersionsQuery extends CatalogBranchQuery {
  @IsOptional() @IsString() @MaxLength(40) diccionario?: string;
}
/** Partes pedidas: "0a,1f,..." (hasta 32). */
class CatalogPartsQuery extends CatalogBranchQuery {
  @IsString()
  @Matches(/^[0-9a-f]{2}(,[0-9a-f]{2}){0,31}$/)
  partes!: string;
}
export class UpdateProductDto {
  @IsOptional() @IsBoolean() generateInternalBarcode?: boolean;
  @IsOptional() @IsString() @MaxLength(120) brand?: string | null;
  @IsOptional() @IsBoolean() isMedication?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) priceDivisor?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) priceMarkupBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(999999999999) priceBaseMinor?:
    number | null;
  @IsOptional() @IsString() @MaxLength(82000) imageDataUrl?: string | null;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() laboratoryId?: string | null;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @IsString() activeIngredient?: string;
  @IsOptional() @IsString() pharmaceuticalForm?: string;
  @IsOptional() @IsString() concentration?: string;
  @IsOptional() @IsString() presentation?: string;
  @IsOptional()
  @IsIn(["official", "preciosderemedios", "alfabeta"])
  externalReferenceSource?:
    "official" | "preciosderemedios" | "alfabeta" | null;
  @IsOptional() @IsString() @MinLength(2) externalReferenceName?: string | null;
  @IsOptional() @IsString() externalReferencePresentation?: string | null;
  @IsOptional() @IsString() externalReferenceBarcode?: string | null;
  @IsOptional() @IsInt() @Min(0) externalReferencePriceMinor?: number | null;
  @IsOptional() @IsIn(["BOX", "BLISTER", "UNIT"]) saleUnit?: SaleUnitValue;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() prescriptionRequired?: boolean;
}
@Controller("organizations/:organizationId/catalog")
@UseGuards(JwtAccessGuard)
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly priceRefresh: CatalogPriceRefreshService,
    private readonly priceUpdates: PriceListUpdates,
  ) {}
  /** Versión de cada parte del catálogo, para que la PC pida sólo lo que cambió. */
  @Get("products/versiones") catalogVersions(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: CatalogVersionsQuery,
  ) {
    return this.catalog.catalogVersions(
      request.auth!.sub,
      id,
      query.branchId,
      query.diccionario,
    );
  }
  /** Productos de algunas partes del catálogo (SISTEMA-74). */
  @Get("products/partes") catalogParts(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: CatalogPartsQuery,
  ) {
    let partes: string[];
    try {
      partes = partesPedidas(query.partes);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Partes inválidas.",
      );
    }
    return this.catalog.catalogParts(
      request.auth!.sub,
      id,
      query.branchId,
      partes,
    );
  }
  @Get("products") list(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Query() query: CatalogBranchQuery,
  ) {
    return this.catalog.list(request.auth!.sub, id, query.branchId);
  }
  @Patch("branches/:branchId/products/:productId/state") branchProductState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() body: BranchProductChangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.changeBranchProduct(
      request.auth!.sub,
      organizationId,
      branchId,
      productId,
      body,
    );
  }
  @Get("options") options(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.options(request.auth!.sub, id);
  }
  @Get("products/:productId/internal-barcode") internalBarcode(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.internalBarcode(
      request.auth!.sub,
      organizationId,
      productId,
      false,
    );
  }
  // Códigos equivalentes (SISTEMA-20): EAN de un envase importado del mismo
  // medicamento, asociado al producto nacional.
  @Post("products/:productId/equivalent-barcodes") addEquivalentBarcode(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body() body: EquivalentBarcodeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.addEquivalentBarcode(
      request.auth!.sub,
      organizationId,
      productId,
      body.code,
    );
  }
  @Delete("products/:productId/equivalent-barcodes/:code")
  removeEquivalentBarcode(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Param("code") code: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.removeEquivalentBarcode(
      request.auth!.sub,
      organizationId,
      productId,
      code,
    );
  }
  @Get("products/:productId/image")
  @Header("Cache-Control", "private, no-store")
  productImage(
    @Param("organizationId") organizationId: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.productImage(
      request.auth!.sub,
      organizationId,
      productId,
    );
  }
  @AllowWhenReadOnly()
  @Post("default-categories")
  ensureDefaultCategories(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.ensureDefaultCategories(request.auth!.sub, id);
  }
  @Get("medicine-status") async medicineStatus(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.catalog.assertPermission(request.auth!.sub, id, "CATALOG_READ");
    return this.priceRefresh.medicineCatalogStatus();
  }
  @Post("price-references/refresh") async refreshPriceReferences(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.catalog.assertPermission(
      request.auth!.sub,
      id,
      "CATALOG_MANAGE",
    );
    return this.priceRefresh.refreshAll(id);
  }
  @Get("price-lists") priceLists(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.priceLists(request.auth!.sub, id);
  }
  @Get("effective-prices") effectivePrices(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Query("customerId") customerId?: string,
    @Query("priceListId") priceListId?: string,
  ) {
    return this.priceUpdates.effective(
      request.auth!.sub,
      id,
      customerId,
      priceListId,
    );
  }
  @AllowWhenReadOnly()
  @Post("price-lists/:priceListId/preview")
  previewPrices(
    @Param("organizationId") id: string,
    @Param("priceListId") listId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: PricePreviewDto,
  ) {
    return this.priceUpdates.preview(request.auth!.sub, id, listId, body);
  }
  @Post("price-lists/:priceListId/changes") savePrices(
    @Param("organizationId") id: string,
    @Param("priceListId") listId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: PriceChangesDto,
  ) {
    return this.priceUpdates.save(request.auth!.sub, id, listId, body);
  }
  @Post("price-lists") createPriceList(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreatePriceListDto,
  ) {
    return this.catalog.createPriceList(
      request.auth!.sub,
      id,
      body.name,
      body.includeAll,
    );
  }
  @Patch("price-lists/:priceListId") renamePriceList(
    @Param("organizationId") id: string,
    @Param("priceListId", ParseUUIDPipe) listId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdatePriceListDto,
  ) {
    return this.catalog.renamePriceList(
      request.auth!.sub,
      id,
      listId,
      body.name,
      body.fallbackPriceListId,
    );
  }
  @Patch("price-lists/:priceListId/products/:productId") setPrice(
    @Param("organizationId") id: string,
    @Param("priceListId") priceListId: string,
    @Param("productId") productId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: SetPriceDto,
  ) {
    return this.priceUpdates.single(
      request.auth!.sub,
      id,
      priceListId,
      productId,
      body.amountMinor,
    );
  }
  @Patch("products/:productId") updateProductStatus(
    @Param("organizationId") id: string,
    @Param("productId") productId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateProductStatusDto,
  ) {
    return this.catalog.updateProductStatus(
      request.auth!.sub,
      id,
      productId,
      body.active,
    );
  }
  @Patch("products/:productId/details") updateProduct(
    @Param("organizationId") id: string,
    @Param("productId") productId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(request.auth!.sub, id, productId, body);
  }
  @Delete("products/:productId") removeProduct(
    @Param("organizationId") id: string,
    @Param("productId") productId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.removeUnusedProduct(request.auth!.sub, id, productId);
  }
  @Post("categories") createCategory(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCategoryDto,
  ) {
    return this.catalog.createCategory(
      request.auth!.sub,
      id,
      body.name,
      body.icon,
      body.color,
      body.parentId,
    );
  }
  @Patch("categories/:itemId/icon")
  categoryIcon(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CategoryIconDto,
  ) {
    return this.catalog.categoryIcon(
      request.auth!.sub,
      organizationId,
      itemId,
      body.icon,
      body.color,
    );
  }
  @Patch("categories/:itemId") editCategory(
    @Param("organizationId") organizationId: string,
    @Param("itemId") itemId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCategoryDto,
  ) {
    return this.catalog.changeNamedItem(
      request.auth!.sub,
      organizationId,
      "categories",
      itemId,
      body.name,
      body.parentId,
    );
  }
  @Delete("categories/:itemId") deleteCategory(
    @Param("organizationId") organizationId: string,
    @Param("itemId") itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.changeNamedItem(
      request.auth!.sub,
      organizationId,
      "categories",
      itemId,
    );
  }
  @Patch("laboratories/:itemId") editLaboratory(
    @Param("organizationId") organizationId: string,
    @Param("itemId") itemId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateNamedCatalogItemDto,
  ) {
    return this.catalog.changeNamedItem(
      request.auth!.sub,
      organizationId,
      "laboratories",
      itemId,
      body.name,
    );
  }
  @Delete("laboratories/:itemId") deleteLaboratory(
    @Param("organizationId") organizationId: string,
    @Param("itemId") itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.changeNamedItem(
      request.auth!.sub,
      organizationId,
      "laboratories",
      itemId,
    );
  }
  @Post("laboratories") createLaboratory(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateNamedCatalogItemDto,
  ) {
    return this.catalog.createLaboratory(request.auth!.sub, id, body.name);
  }
  @Get("laboratories/:itemId/logo")
  @Header("Cache-Control", "private, no-store")
  laboratoryLogo(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.laboratoryLogo(
      request.auth!.sub,
      organizationId,
      itemId,
    );
  }
  @Patch("laboratories/:itemId/logo")
  saveLaboratoryLogo(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: LaboratoryLogoDto,
  ) {
    return this.catalog.saveLaboratoryLogo(
      request.auth!.sub,
      organizationId,
      itemId,
      body.dataUrl,
    );
  }
  @Delete("laboratories/:itemId/logo")
  removeLaboratoryLogo(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.saveLaboratoryLogo(
      request.auth!.sub,
      organizationId,
      itemId,
      null,
    );
  }
  @Post("products") create(
    @Param("organizationId") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateProductDto,
  ) {
    return this.catalog.create(request.auth!.sub, id, body);
  }
}
