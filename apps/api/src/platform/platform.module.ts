import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CredentialVault } from "../fiscal/credential-vault";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformController } from "./platform.controller";
import { PlatformIdentityService } from "./platform-identity.service";
import { PlatformOrganizationsController } from "./platform-organizations.controller";
import { PlatformOrganizationsService } from "./platform-organizations.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformController, PlatformOrganizationsController],
  providers: [
    PlatformAdminGuard,
    PlatformIdentityService,
    PlatformOrganizationsService,
    CredentialVault,
  ],
})
export class PlatformModule {}
