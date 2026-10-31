import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CashController } from "./cash.controller";
import { CashService } from "./cash.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CashController],
  providers: [CashService],
})
export class CashModule {}
