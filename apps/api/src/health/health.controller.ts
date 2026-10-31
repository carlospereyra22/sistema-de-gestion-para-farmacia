import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

import type { HealthResponse } from "@gestion/contracts";

import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(
    @Res({ passthrough: true }) httpResponse: Response,
  ): Promise<HealthResponse> {
    const response = await this.healthService.check();

    if (response.status === "error") {
      httpResponse.status(503);
    }

    return response;
  }
}
