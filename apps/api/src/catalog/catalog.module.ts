import { Module } from "@nestjs/common";
import { AlfaBetaService } from "./alfabeta.service";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { CatalogPriceRefreshService } from "./catalog-price-refresh.service";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { PriceListUpdates } from "./price-list-updates";
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
  ],
  providers: [
    ExternalCatalogService,
    AlfaBetaService,
    CatalogService,
    PriceListUpdates,
    MedicineReferenceService,
    CatalogPriceRefreshService,
  ],
})
export class CatalogModule {}
