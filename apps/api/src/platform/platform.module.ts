import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthModule } from "../auth/auth.module";
import { CredentialVault } from "../fiscal/credential-vault";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformBillingService } from "./platform-billing.service";
import { PlatformController } from "./platform.controller";
import { PlatformIdentityService } from "./platform-identity.service";
import { PlatformOrganizationsController } from "./platform-organizations.controller";
import { PlatformOrganizationsService } from "./platform-organizations.service";
import { SubscriptionAccessInterceptor } from "./subscription-access.interceptor";
import {
  SubscriptionStatusController,
  SubscriptionStatusService,
} from "./subscription-status.controller";

@Module({
  imports: [AuthModule],
  controllers: [
    PlatformController,
    PlatformOrganizationsController,
    SubscriptionStatusController,
  ],
  providers: [
    PlatformAdminGuard,
    PlatformBillingService,
    PlatformIdentityService,
    PlatformOrganizationsService,
    SubscriptionStatusService,
    CredentialVault,
    // Global: aplica el estado comercial a toda ruta con :organizationId.
    { provide: APP_INTERCEPTOR, useClass: SubscriptionAccessInterceptor },
  ],
})
export class PlatformModule {}
