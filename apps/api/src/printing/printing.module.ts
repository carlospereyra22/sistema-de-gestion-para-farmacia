import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrintQueueService } from "./print-queue.service";
import {
  PrintGatewayController,
  PrintingController,
} from "./printing.controller";

@Module({
  imports: [AuthModule],
  controllers: [PrintingController, PrintGatewayController],
  providers: [PrintQueueService],
  exports: [PrintQueueService],
})
export class PrintingModule {}
