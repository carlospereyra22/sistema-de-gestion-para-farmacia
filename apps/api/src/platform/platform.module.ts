import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CredentialVault } from "../fiscal/credential-vault";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformController } from "./platform.controller";
import { PlatformIdentityService } from "./platform-identity.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformAdminGuard, PlatformIdentityService, CredentialVault],
})
export class PlatformModule {}
