import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { EnvironmentService } from "../config/environment.service";
import { urlConLimiteDeConexiones } from "./limite-conexiones";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(environment: EnvironmentService) {
    // Tope de conexiones por proceso (API, worker), SISTEMA-106.
    const url = urlConLimiteDeConexiones(
      environment.databaseUrl,
      process.env.DATABASE_CONNECTION_LIMIT,
      process.env.DATABASE_POOL_TIMEOUT,
    );
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
