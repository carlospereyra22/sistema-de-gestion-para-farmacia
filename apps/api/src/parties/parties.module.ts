import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  PartiesController,
  PartiesOfflineController,
  SuppliersOfflineController,
} from "./parties.controller";
import { PartiesService } from "./parties.service";

@Module({
  imports: [AuthModule],
  controllers: [
    PartiesController,
    PartiesOfflineController,
    SuppliersOfflineController,
  ],
  providers: [PartiesService],
})
export class PartiesModule {}
