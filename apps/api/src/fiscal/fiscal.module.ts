import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CredentialVault } from "./credential-vault";
import { FiscalCredentialsService } from "./fiscal-credentials.service";
import { FiscalCredentialsController } from "./fiscal-credentials.controller";
import { ArcaSoap } from "./arca-soap";
import { ArcaConnectionService } from "./arca-connection.service";
import { FiscalTrialService } from "./fiscal-trial.service";
import { FiscalTestingController } from "./fiscal-testing.controller";
import { FiscalSalesService } from "./fiscal-sales.service";
import { FiscalProductionController } from "./fiscal-production.controller";
import { ProductionSalesService } from "./production-sales.service";
import { ProductionConfigurationService } from "./production-configuration.service";
import { ProductionCreditService } from "./production-credit.service";
import { AccountsModule } from "../accounts/accounts.module";
import { ColaFiscalService } from "./cola-fiscal.service";
import { PadronService } from "./padron.service";
import { PadronController } from "./padron.controller";
@Module({
  imports: [AuthModule, OrganizationsModule, AccountsModule],
  providers: [
    PadronService,
    ColaFiscalService,
    ProductionCreditService,
    ProductionSalesService,
    ProductionConfigurationService,
    FiscalSalesService,
    CredentialVault,
    FiscalCredentialsService,
    ArcaSoap,
    ArcaConnectionService,
    FiscalTrialService,
  ],
  controllers: [
    PadronController,
    FiscalCredentialsController,
    FiscalTestingController,
    FiscalProductionController,
  ],
  exports: [
    FiscalSalesService,
    ProductionSalesService,
    ProductionConfigurationService,
    ProductionCreditService,
  ],
})
export class FiscalModule {}
