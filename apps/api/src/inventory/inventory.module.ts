import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { DistributionService } from "./distribution.service";
import { DistributionController } from "./distribution.controller";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [InventoryController, DistributionController],
  providers: [InventoryService, DistributionService],
})
export class InventoryModule {}
