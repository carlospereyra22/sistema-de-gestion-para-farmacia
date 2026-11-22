import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import { ReportAccessService } from "./report-access.service";
import { ReportFiltersQuery } from "./report-filters.dto";
import { ReportOverviewService } from "./report-overview.service";
import { ReportSalesService } from "./report-sales.service";
import { ReportProfitabilityService } from "./report-profitability.service";
import { ReportProductsService } from "./report-products.service";
import { ReportInventoryService } from "./report-inventory.service";
import { ReportPurchasesService } from "./report-purchases.service";
import { ReportCustomersService } from "./report-customers.service";

/**
 * Reportes a nivel organizacion: pueden abarcar varias sucursales, por eso no usan
 * BranchAccessGuard; ReportAccessService valida cada sucursal pedida.
 */
@Controller("organizations/:organizationId/reports")
@UseGuards(JwtAccessGuard)
export class ReportFiltersController {
  constructor(
    private readonly access: ReportAccessService,
    private readonly overviewReport: ReportOverviewService,
    private readonly salesReport: ReportSalesService,
    private readonly profitabilityReport: ReportProfitabilityService,
    private readonly productsReport: ReportProductsService,
    private readonly inventoryReport: ReportInventoryService,
    private readonly purchasesReport: ReportPurchasesService,
    private readonly customersReport: ReportCustomersService,
  ) {}

  @Get("filter-options") filterOptions(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.access.filterOptions(req.auth!.sub, organizationId);
  }

  @Get("overview") overview(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.overviewReport.overview(req.auth!.sub, organizationId, query);
  }

  /** Pestaña Ventas (SISTEMA-115). */
  @Get("sales") sales(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.salesReport.sales(req.auth!.sub, organizationId, query);
  }

  /** Pestaña Rentabilidad (SISTEMA-116). */
  @Get("profitability") profitability(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.profitabilityReport.profitability(
      req.auth!.sub,
      organizationId,
      query,
    );
  }

  /** Pestaña Productos (SISTEMA-116). */
  @Get("products") products(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.productsReport.products(req.auth!.sub, organizationId, query);
  }

  /** Pestaña Inventario (SISTEMA-116). */
  @Get("inventory") inventory(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.inventoryReport.inventory(req.auth!.sub, organizationId, query);
  }

  /** Pestaña Compras y proveedores (SISTEMA-116). */
  @Get("purchases") purchases(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.purchasesReport.purchases(req.auth!.sub, organizationId, query);
  }

  /** Pestaña Clientes y cuentas corrientes (SISTEMA-116). */
  @Get("customers") customers(
    @Req() req: AuthenticatedRequest,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ReportFiltersQuery,
  ) {
    return this.customersReport.customers(req.auth!.sub, organizationId, query);
  }
}
