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

import { LoginDto } from "./auth.dto";
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
  ) {
    const result = await this.auth.refresh(
      request.cookies?.gestion_refresh as string | undefined,
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
  async me(@Req() request: AuthenticatedRequest) {
    const profile = await this.auth.getProfile(request.auth!.sub);
    if (!profile) throw new UnauthorizedException("User is unavailable.");
    return profile;
  }
}
