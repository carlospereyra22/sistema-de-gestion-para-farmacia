import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type, plainToInstance } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  MaxLength,
  ValidateNested,
  validate,
} from "class-validator";
import {
  MAXIMO_PAGINA_HISTORIAL,
  TAMANIO_PAGINA_HISTORIAL,
} from "./historial-ventas";
import { PaymentMethod } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { assertNoEsSoporte } from "../auth/soporte";
import { BranchAccessGuard } from "../auth/branch-access.guard";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { SalesService } from "./sales.service";
import { SaleFiscalOptionsDto } from "../fiscal/sale-fiscal-options";
import { ProductionCreditService } from "../fiscal/production-credit.service";
import { ProductionSalesService } from "../fiscal/production-sales.service";
import {
  AllowOwnerWhenBlocked,
  AllowWhenReadOnly,
  DecidedWhenOccurred,
} from "../platform/subscription-gate";

class SaleLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requestedUnitPriceMinor?: number;
  @IsOptional() @IsString() expectedUnitPriceMinor?: string;
  // Ahorro por ofertas que vio la cajera (SISTEMA-103), en centavos.
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}$/)
  expectedOfferDiscountMinor?: string;
  // La cajera eligió no aplicar ofertas a este producto (SISTEMA-103).
  @IsOptional() @IsBoolean() skipOffers?: boolean;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) unitPriceMinor?: number;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountMinor?: number;
  // Unidades de la línea vendidas como exhibidor cerrado.
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) packQuantity?: number;
  // Sin conexión: nombre que vio la PC, por si el producto ya no se vende.
  @IsOptional() @IsString() @MaxLength(200) productName?: string;
}
class AppliedOfferItemDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) units!: number;
  @IsString() @Matches(/^\d{1,15}$/) grossMinor!: string;
  @IsString() @Matches(/^\d{1,15}$/) discountMinor!: string;
}
/** Oferta que aplicó la PC sin conexión (SISTEMA-103). */
class AppliedOfferDto {
  @IsUUID() offerId!: string;
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AppliedOfferItemDto)
  items!: AppliedOfferItemDto[];
}
class PaymentDto {
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() cashSessionId?: string;
}
class CompleteSaleDto {
  @IsOptional() @IsIn(["HOMOLOGATION", "PRODUCTION"]) fiscalEnvironment?:
    "HOMOLOGATION" | "PRODUCTION";
  @IsOptional() @IsBoolean() confirmProduction?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => SaleFiscalOptionsDto)
  fiscalOptions?: SaleFiscalOptionsDto;
  @IsOptional() @IsBoolean() confirmHomologation?: boolean;
  @IsOptional() @IsIn(["INTERNAL", "INVOICE"]) documentType?:
    "INTERNAL" | "INVOICE";
  @IsOptional() @IsUUID() priceListId?: string;
  @IsOptional() @IsUUID() clientOperationId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items!: SaleLineDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments!: PaymentDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AppliedOfferDto)
  appliedOffers?: AppliedOfferDto[];
  // Ofertas que la cajera quitó de esta venta (SISTEMA-103).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  skippedOfferIds?: string[];
}
/** Mandar a ARCA una venta hecha con comprobante interno (SISTEMA-65). */
class InvoiceInternalDto {
  @IsOptional() @IsIn(["HOMOLOGATION", "PRODUCTION"]) fiscalEnvironment?:
    "HOMOLOGATION" | "PRODUCTION";
  @IsOptional() @IsBoolean() confirmProduction?: boolean;
  @IsOptional() @IsBoolean() confirmHomologation?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => SaleFiscalOptionsDto)
  fiscalOptions?: SaleFiscalOptionsDto;
}
/** Venta hecha sin conexión (SISTEMA-63): la de siempre, más cuándo y dónde. */
class OfflineSaleDto extends CompleteSaleDto {
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsUUID() deviceId!: string;
}
/** Venta sin conexión de otro usuario de la PC, firmada por él (SISTEMA-66). */
class SignedOfflineSaleDto {
  @IsUUID() sellerId!: string;
  @IsUUID() deviceId!: string;
  /** Texto exacto de la venta (JSON), el mismo que se firmó. */
  @IsString() @MaxLength(200000) payload!: string;
  @IsString() @MaxLength(200) signature!: string;
}
class ResolveOfflineIssueDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class ReasonDto {
  @IsString() @MinLength(3) reason!: string;
}
class CustomerReturnItemDto {
  @IsString() saleItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
class CustomerReturnDto extends ReasonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerReturnItemDto)
  items!: CustomerReturnItemDto[];
}
class CreditDto extends CustomerReturnDto {
  @IsUUID() requestId!: string;
  @IsBoolean() confirmProduction!: boolean;
}
class SettleCreditDto {
  @IsInt() @Min(0) expectedAccountMinor!: number;
  @IsInt() @Min(0) expectedRefundMinor!: number;
  @IsIn(["CASH", "CARD", "TRANSFER"]) method!: "CASH" | "CARD" | "TRANSFER";
  @IsOptional() @IsUUID() cashSessionId?: string;
  @IsString() @MinLength(3) @MaxLength(300) reference!: string;
  @IsBoolean() received!: boolean;
  @IsBoolean() confirm!: boolean;
}

/** Filtros del historial de ventas (SISTEMA-104). */
class SalesHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAXIMO_PAGINA_HISTORIAL)
  pageSize?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(["COMPLETED", "CANCELLED"]) status?:
    "COMPLETED" | "CANCELLED";
  @IsOptional() @IsIn(["INTERNAL", "INVOICE"]) documentType?:
    "INTERNAL" | "INVOICE";
  @IsOptional()
  @IsIn(["CASH", "CARD", "TRANSFER", "ACCOUNT", "OTHER"])
  method?: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
  @IsOptional() @IsString() @MaxLength(36) q?: string;
}
@Controller("organizations/:organizationId/branches/:branchId/sales")
@UseGuards(JwtAccessGuard, BranchAccessGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly credits: ProductionCreditService,
    private readonly production: ProductionSalesService,
  ) {}
  @AllowOwnerWhenBlocked()
  @Get(":saleId/credits")
  creditsDetail(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ) {
    return this.credits.detail(req.auth!.sub, org, branch, saleId);
  }
  @Post(":saleId/credits") createCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Body() input: CreditDto,
  ) {
    assertNoEsSoporte(req);
    return this.credits.create(req.auth!.sub, org, branch, saleId, input);
  }
  @AllowWhenReadOnly()
  @Post(":saleId/credits/:documentId/process")
  processCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    assertNoEsSoporte(req);
    return this.production.process(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
    );
  }
  @AllowOwnerWhenBlocked()
  @Get(":saleId/credits/:documentId/settlement")
  creditSettlement(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    return this.credits.previewSettlement(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
    );
  }
  @AllowWhenReadOnly()
  @Post(":saleId/credits/:documentId/settlement")
  settleCredit(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: SettleCreditDto,
  ) {
    assertNoEsSoporte(req);
    return this.credits.settle(
      req.auth!.sub,
      org,
      branch,
      saleId,
      documentId,
      input,
    );
  }
  @Get("fiscal-options") fiscalOptions(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
  ) {
    return this.sales.fiscalOptions(req.auth!.sub, org, branch);
  }
  @AllowOwnerWhenBlocked()
  @Get(":saleId/invoice")
  invoice(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
  ) {
    return this.sales.invoice(req.auth!.sub, org, branch, id);
  }
  @AllowWhenReadOnly()
  @Post(":saleId/invoice/process")
  processInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
  ) {
    assertNoEsSoporte(req);
    return this.sales.invoice(req.auth!.sub, org, branch, id, true);
  }
  @AllowWhenReadOnly()
  @Post(":saleId/invoice/reencolar")
  requeueInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
  ) {
    assertNoEsSoporte(req);
    return this.sales.requeueInvoice(req.auth!.sub, org, branch, id);
  }
  /** Comprobante interno → factura C, a mano y hasta 30 días después. */
  @Post(":saleId/invoice/emitir")
  invoiceInternal(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId") org: string,
    @Param("branchId") branch: string,
    @Param("saleId", ParseUUIDPipe) id: string,
    @Body() body: InvoiceInternalDto,
  ) {
    assertNoEsSoporte(req);
    return this.sales.invoiceInternal(req.auth!.sub, org, branch, id, body);
  }
  @AllowOwnerWhenBlocked()
  @Get(":saleId/ticket")
  ticket(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ) {
    return this.sales.ticket(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
    );
  }
  /**
   * Historial paginado y con filtros (SISTEMA-104). Es la misma consulta de
   * ventas que el dueño sigue viendo con la farmacia bloqueada.
   */
  @AllowOwnerWhenBlocked()
  @Get("history")
  history(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query() query: SalesHistoryQueryDto,
  ) {
    const { page = 1, pageSize = TAMANIO_PAGINA_HISTORIAL, ...filtro } = query;
    return this.sales.history(
      request.auth!.sub,
      organizationId,
      branchId,
      filtro,
      page,
      pageSize,
    );
  }
  @AllowOwnerWhenBlocked()
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.sales.list(request.auth!.sub, organizationId, branchId);
  }
  @Post() complete(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: CompleteSaleDto,
  ) {
    if (body.fiscalEnvironment === "PRODUCTION") assertNoEsSoporte(request);
    return this.sales.complete(
      request.auth!.sub,
      organizationId,
      branchId,
      body,
    );
  }
  /** Venta hecha sin conexión que la PC sincroniza al volver (SISTEMA-63). */
  @DecidedWhenOccurred()
  @Post("offline")
  completeOffline(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: OfflineSaleDto,
  ) {
    if (!body.clientOperationId)
      throw new BadRequestException(
        "La venta sin conexión necesita su identificador.",
      );
    return this.sales.completeOffline(
      request.auth!.sub,
      organizationId,
      branchId,
      { ...body, clientOperationId: body.clientOperationId },
    );
  }
  /**
   * Venta sin conexión de otro usuario de esta PC (SISTEMA-66): se valida el
   * texto firmado como cualquier venta sin conexión y queda a nombre de quien
   * la hizo.
   */
  @DecidedWhenOccurred()
  @Post("offline/firmada")
  async completeOfflineSigned(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Body() body: SignedOfflineSaleDto,
  ) {
    let datos: unknown;
    try {
      datos = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException("La venta firmada no se puede leer.");
    }
    const input = plainToInstance(OfflineSaleDto, datos);
    const errores = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errores.length || !input.clientOperationId)
      throw new BadRequestException("La venta firmada tiene datos inválidos.");
    if (input.deviceId !== body.deviceId)
      throw new BadRequestException("La venta no corresponde a esa PC.");
    return this.sales.completeOfflineSigned(
      request.auth!.sub,
      organizationId,
      branchId,
      {
        sellerId: body.sellerId,
        deviceId: body.deviceId,
        payload: body.payload,
        signature: body.signature,
      },
      { ...input, clientOperationId: input.clientOperationId },
    );
  }
  /** Avisos "a revisar" de lo sincronizado sin conexión. */
  @Get("offline-issues")
  offlineIssues(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Query("todos") all?: string,
  ) {
    return this.sales.offlineIssues(
      request.auth!.sub,
      organizationId,
      branchId,
      all === "1",
    );
  }
  @AllowWhenReadOnly()
  @Post("offline-issues/:issueId/resolve")
  resolveOfflineIssue(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("issueId", ParseUUIDPipe) issueId: string,
    @Body() body: ResolveOfflineIssueDto,
  ) {
    return this.sales.resolveOfflineIssue(
      request.auth!.sub,
      organizationId,
      branchId,
      issueId,
      body.note,
    );
  }
  @Post(":saleId/cancel")
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId") saleId: string,
    @Body() body: ReasonDto,
  ) {
    return this.sales.cancel(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
      body.reason,
    );
  }
  @Post(":saleId/customer-returns")
  customerReturn(
    @Req() request: AuthenticatedRequest,
    @Param("organizationId") organizationId: string,
    @Param("branchId") branchId: string,
    @Param("saleId") saleId: string,
    @Body() body: CustomerReturnDto,
  ) {
    return this.sales.customerReturn(
      request.auth!.sub,
      organizationId,
      branchId,
      saleId,
      body,
    );
  }
}
