import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { EnvironmentService } from "../config/environment.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { BranchAccessGuard } from "./branch-access.guard";
import { JwtAccessGuard } from "./jwt-access.guard";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvironmentService],
      useFactory: (environment: EnvironmentService) => ({
        secret:
          environment.jwtAccessSecret ??
          "configure-a-32-character-jwt-secret-before-using-auth",
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, BranchAccessGuard],
  exports: [AuthService, JwtAccessGuard, BranchAccessGuard, JwtModule],
})
export class AuthModule {}
