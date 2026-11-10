import { Controller, Get, Header, Param, Req, UseGuards } from "@nestjs/common";
import { JwtAccessGuard } from "../auth/jwt-access.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PadronService } from "./padron.service";

/** Buscar un CUIT en el padrón de ARCA al cargar un cliente (SISTEMA-70). */
@Controller("organizations/:organizationId/fiscal/padron")
@UseGuards(JwtAccessGuard)
export class PadronController {
  constructor(private readonly padron: PadronService) {}
  @Get(":cuit") @Header("Cache-Control", "no-store") consultar(
    @Param("organizationId") org: string,
    @Param("cuit") cuit: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.padron.consultar(req.auth!.sub, org, cuit);
  }
}
