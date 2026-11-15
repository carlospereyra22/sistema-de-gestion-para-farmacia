import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

/** Ofertas (SISTEMA-103): alta, edición, estados, auditoría y reporte. */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
