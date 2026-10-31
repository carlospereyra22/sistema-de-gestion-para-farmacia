import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { EnvironmentService } from "../config/environment.service";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(environment: EnvironmentService) {
    super(
      environment.databaseUrl
        ? { datasources: { db: { url: environment.databaseUrl } } }
        : undefined,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
