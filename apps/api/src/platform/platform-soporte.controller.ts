import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformSoporteService } from "./platform-soporte.service";

/** Entrar como un usuario de una farmacia y volver al panel (SISTEMA-89). */
@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformSoporteController {
  constructor(private readonly soporte: PlatformSoporteService) {}

  @Post("organizations/:id/users/:userId/soporte")
  entrar(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.soporte.entrar(request.auth!.sub, organizationId, userId);
  }

  @Post("soporte/:sessionId/salir")
  @HttpCode(204)
  async salir(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    await this.soporte.salir(request.auth!.sub, sessionId);
  }
}
