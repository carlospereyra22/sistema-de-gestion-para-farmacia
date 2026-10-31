import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Environment } from "./environment.validation";

@Injectable()
export class EnvironmentService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get port(): number {
    return this.config.get("PORT", { infer: true });
  }

  get host(): string {
    return this.config.get("HOST", { infer: true });
  }

  get corsOrigin(): string {
    return this.config.get("CORS_ORIGIN", { infer: true });
  }

  get databaseUrl(): string | undefined {
    return this.config.get("DATABASE_URL", { infer: true });
  }

  get jwtAccessSecret(): string | undefined {
    return this.config.get("JWT_ACCESS_SECRET", { infer: true });
  }
}
