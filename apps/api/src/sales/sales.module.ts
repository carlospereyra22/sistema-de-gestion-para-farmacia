import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { FiscalModule } from "../fiscal/fiscal.module";

@Module({
  imports: [AuthModule, AuditModule, FiscalModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
