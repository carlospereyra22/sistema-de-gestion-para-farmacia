import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { SupplierPayablesController } from "./supplier-payables.controller";
import { SupplierPayablesService } from "./supplier-payables.service";
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [SupplierPayablesController],
  providers: [SupplierPayablesService],
  exports: [SupplierPayablesService],
})
export class SupplierPayablesModule {}
