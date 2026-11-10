import { Module } from "@nestjs/common";
import { AlfaBetaService } from "./alfabeta.service";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { CatalogPriceRefreshService } from "./catalog-price-refresh.service";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { CatalogOfflineController } from "./catalogo-sin-conexion.controller";
import { CatalogOfflineService } from "./catalogo-sin-conexion.service";
import { PriceListUpdates } from "./price-list-updates";
import { MedicineCatalogService } from "./medicine-catalog.service";
import { MedicineReferenceController } from "./medicine-reference.controller";
import { MedicineReferenceService } from "./medicine-reference.service";
import { ExternalCatalogService } from "./external-catalog.service";
import { ExternalCatalogController } from "./external-catalog.controller";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    CatalogController,
    MedicineReferenceController,
    ExternalCatalogController,
    CatalogOfflineController,
  ],
  providers: [
    ExternalCatalogService,
    AlfaBetaService,
    CatalogService,
    CatalogOfflineService,
    PriceListUpdates,
    MedicineReferenceService,
    MedicineCatalogService,
    CatalogPriceRefreshService,
  ],
})
export class CatalogModule {}
