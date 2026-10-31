import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { FiscalModule } from "./fiscal/fiscal.module";
import { AccountsModule } from "./accounts/accounts.module";
import { AuditModule } from "./audit/audit.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CashModule } from "./cash/cash.module";

import { EnvironmentModule } from "./config/environment.module";
import { validateEnvironment } from "./config/environment.validation";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PartiesModule } from "./parties/parties.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { SupplierPayablesModule } from "./supplier-payables/supplier-payables.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RolesModule } from "./roles/roles.module";
import { ReportsModule } from "./reports/reports.module";
import { SalesModule } from "./sales/sales.module";
import { TransfersModule } from "./transfers/transfers.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    EnvironmentModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    AccountsModule,
    AuditModule,
    CatalogModule,
    CashModule,
    InventoryModule,
    SalesModule,
    TransfersModule,
    UsersModule,
    RolesModule,
    ReportsModule,
    OrganizationsModule,
    FiscalModule,
    PartiesModule,
    PurchasesModule,
    SupplierPayablesModule,
  ],
})
export class AppModule {}
