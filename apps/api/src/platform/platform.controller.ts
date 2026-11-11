import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsString, Matches } from "class-validator";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformIdentityService } from "./platform-identity.service";
import { ENCABEZADO_PLATAFORMA } from "./platform-token";
import {
  PlatformTokenService,
  type DatosDelPedido,
} from "./platform-token.service";
import { PlatformVerificationOptional } from "./platform-verification-optional.decorator";

class PlatformCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Ingresá los 6 dígitos del código." })
  code!: string;
}

@Controller("platform")
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly identity: PlatformIdentityService,
    private readonly tokens: PlatformTokenService,
  ) {}

  private datos(request: AuthenticatedRequest): DatosDelPedido {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }

  @Get("session")
  @PlatformVerificationOptional()
  session(@Req() request: AuthenticatedRequest) {
    const { sub, sessionId } = request.auth!;
    return this.identity.session(
      sub,
      sessionId,
      request.headers[ENCABEZADO_PLATAFORMA],
      this.datos(request),
    );
  }

  @Post("totp/enroll")
  @HttpCode(200)
  @PlatformVerificationOptional()
  enroll(@Req() request: AuthenticatedRequest) {
    const { sub, email } = request.auth!;
    return this.identity.enroll(sub, email);
  }

  @Post("totp/confirm")
  @HttpCode(200)
  @PlatformVerificationOptional()
  confirm(@Req() request: AuthenticatedRequest, @Body() body: PlatformCodeDto) {
    const { sub, sessionId } = request.auth!;
    return this.identity.confirm(
      sub,
      sessionId,
      body.code,
      this.datos(request),
    );
  }

  @Post("totp/verify")
  @HttpCode(200)
  @PlatformVerificationOptional()
  verify(@Req() request: AuthenticatedRequest, @Body() body: PlatformCodeDto) {
    const { sub, sessionId } = request.auth!;
    return this.identity.verify(sub, sessionId, body.code, this.datos(request));
  }

  /** "Salir del panel": revoca el token de esta pestaña, si lo tiene. */
  @Post("token/salir")
  @HttpCode(204)
  @PlatformVerificationOptional()
  async salir(@Req() request: AuthenticatedRequest) {
    const { sub, sessionId } = request.auth!;
    await this.tokens.revocarPropio(
      request.headers[ENCABEZADO_PLATAFORMA],
      { userId: sub, sessionId },
      this.datos(request),
    );
  }

  /** Sesiones del panel abiertas (pestañas con el código ingresado). */
  @Get("tokens")
  tokensAbiertos(@Req() request: AuthenticatedRequest) {
    return this.tokens.listar(request.auth!.sub, request.plataforma?.tokenId);
  }

  @Post("tokens/close-others")
  @HttpCode(200)
  async cerrarOtros(@Req() request: AuthenticatedRequest) {
    const cerradas = await this.tokens.revocar(
      request.auth!.sub,
      { id: { not: request.plataforma!.tokenId } },
      "PLATFORM_TOKEN_REVOKED_ALL",
      this.datos(request),
    );
    return { cerradas };
  }

  @Delete("tokens/:id")
  cerrarUno(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.tokens.cerrarUno(request.auth!.sub, id, this.datos(request));
  }

  @Get("audit")
  audit() {
    return this.identity.audit();
  }
}
