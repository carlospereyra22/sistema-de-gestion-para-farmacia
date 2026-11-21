import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { FiscalModule } from "../fiscal/fiscal.module";
import { AccountsModule } from "../accounts/accounts.module";
import { NotasCreditoService } from "./notas-credito.service";

@Module({
  imports: [AuthModule, AuditModule, FiscalModule, AccountsModule],
  controllers: [SalesController],
  providers: [SalesService, NotasCreditoService],
  exports: [SalesService],
})
export class SalesModule {}
