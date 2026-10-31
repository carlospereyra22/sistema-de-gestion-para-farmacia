import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
