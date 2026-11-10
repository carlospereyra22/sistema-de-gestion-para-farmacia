import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  PartiesController,
  PartiesOfflineController,
} from "./parties.controller";
import { PartiesService } from "./parties.service";

@Module({
  imports: [AuthModule],
  controllers: [PartiesController, PartiesOfflineController],
  providers: [PartiesService],
})
export class PartiesModule {}
