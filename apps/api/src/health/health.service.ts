import { Injectable } from "@nestjs/common";

import type { HealthResponse } from "@gestion/contracts";

import { EnvironmentService } from "../config/environment.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly environment: EnvironmentService,
  ) {}

  async check(): Promise<HealthResponse> {
    if (!this.environment.databaseUrl) {
      return {
        status: "error",
        database: "unavailable",
        message: "Database is not configured yet.",
      };
    }

    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return { status: "ok", database: "ok" };
    } catch {
      return {
        status: "error",
        database: "unavailable",
        message: "Database is unavailable.",
      };
    }
  }
}
