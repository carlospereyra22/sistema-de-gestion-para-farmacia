import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { AllowPendingPasswordChange } from "./allow-pending-password-change.decorator";
import {
  ChangePasswordDto,
  LoginDto,
  OfflineKeyDto,
  RefreshDto,
} from "./auth.dto";
import { AuthService } from "./auth.service";
import { JwtAccessGuard } from "./jwt-access.guard";
import type { AuthenticatedRequest } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie("gestion_refresh", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api/v1/auth",
      maxAge: 400 * 86400000,
    });
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: RefreshDto = {},
  ) {
    const result = await this.auth.refresh(
      request.cookies?.gestion_refresh as string | undefined,
      body?.usuarioEsperado,
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      request.cookies?.gestion_refresh as string | undefined,
    );
    response.clearCookie("gestion_refresh", { path: "/api/v1/auth" });
  }

  @Get("me")
  @UseGuards(JwtAccessGuard)
  @AllowPendingPasswordChange()
  async me(@Req() request: AuthenticatedRequest) {
    const profile = await this.auth.getProfile(request.auth!.sub);
    if (!profile)
      throw new UnauthorizedException("El usuario no está disponible.");
    const { platformAdmin, ...user } = profile;
    return { ...user, isPlatformAdmin: platformAdmin?.active ?? false };
  }

  /** Clave de esta PC para firmar las ventas sin conexión (SISTEMA-66). */
  @Post("offline-key")
  @HttpCode(204)
  @UseGuards(JwtAccessGuard)
  async offlineKey(
    @Req() request: AuthenticatedRequest,
    @Body() body: OfflineKeyDto,
  ) {
    await this.auth.registerOfflineKey(
      request.auth!.sub,
      body.deviceId,
      body.publicKey,
    );
  }

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(JwtAccessGuard)
  @AllowPendingPasswordChange()
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      request.auth!.sub,
      request.auth!.sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
