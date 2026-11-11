import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AllowPendingPasswordChange } from "./allow-pending-password-change.decorator";
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  OfflineKeyDto,
  RefreshDto,
} from "./auth.dto";
import { AuthService, type DatosDeSesion } from "./auth.service";
import { JwtAccessGuard } from "./jwt-access.guard";
import type { AuthenticatedRequest } from "./auth.types";

/** Cookie de la sesión de farmacia. */
export const COOKIE_FARMACIA = "gestion_refresh";
/**
 * Cookie propia del superadmin (SISTEMA-100): iniciar sesión en el panel no
 * reemplaza la sesión de la farmacia de ese navegador. No es persistente.
 */
export const COOKIE_PLATAFORMA = "gestion_plataforma";

const cookieDe = (sesion?: "plataforma") =>
  sesion === "plataforma" ? COOKIE_PLATAFORMA : COOKIE_FARMACIA;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * La cookie dura lo mismo que el plazo de inactividad y se renueva con cada
   * uso (vencimiento deslizante, SISTEMA-93). Antes eran 400 días fijos.
   */
  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    persistente: boolean,
    nombre: string = COOKIE_FARMACIA,
  ): void {
    response.cookie(nombre, refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api/v1/auth",
      // Superadmin (SISTEMA-94): sin maxAge, se borra al cerrar el navegador.
      ...(persistente ? { maxAge: this.auth.inactividadMs } : {}),
    });
  }

  /** Navegador, IP e id de la PC para reconocer la sesión (sin secretos). */
  private datosDeSesion(request: Request, deviceId?: string): DatosDeSesion {
    return {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
      deviceId,
    };
  }

  /** El soporte del superadmin no ve ni cierra las sesiones del usuario. */
  private sinSoporte(request: AuthenticatedRequest) {
    if (request.auth?.soporte)
      throw new ForbiddenException(
        "Las sesiones las administra el usuario, no el soporte.",
      );
    return request.auth!;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      body.email,
      body.password,
      this.datosDeSesion(request, body.deviceId),
    );
    // El superadmin va en su propia cookie: la de la farmacia no se toca.
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.persistente,
      result.persistente ? COOKIE_FARMACIA : COOKIE_PLATAFORMA,
    );
    return { accessToken: result.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: RefreshDto = {},
  ) {
    const cookie = cookieDe(body?.sesion);
    const result = await this.auth.refresh(
      request.cookies?.[cookie] as string | undefined,
      body?.usuarioEsperado,
      this.datosDeSesion(request, body?.deviceId),
    );
    // Sólo cuando la clave rotó: si se usó la anterior dentro del margen, la
    // cookie nueva ya la guardó otra pestaña.
    if (result.refreshToken)
      this.setRefreshCookie(
        response,
        result.refreshToken,
        result.persistente,
        cookie,
      );
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: LogoutDto = {},
  ) {
    const cookie = cookieDe(body?.sesion);
    await this.auth.logout(request.cookies?.[cookie] as string | undefined);
    response.clearCookie(cookie, { path: "/api/v1/auth" });
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

  /** Sesiones abiertas del usuario (menú de la cuenta, SISTEMA-93). */
  @Get("sessions")
  @UseGuards(JwtAccessGuard)
  @AllowPendingPasswordChange()
  sessions(@Req() request: AuthenticatedRequest) {
    const { sub, sessionId } = this.sinSoporte(request);
    return this.auth.listarSesionesPropias(sub, sessionId);
  }

  @Post("sessions/close-others")
  @HttpCode(200)
  @UseGuards(JwtAccessGuard)
  @AllowPendingPasswordChange()
  closeOtherSessions(@Req() request: AuthenticatedRequest) {
    const { sub, sessionId } = this.sinSoporte(request);
    return this.auth.cerrarSesionesPropias(sub, sessionId);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(200)
  @UseGuards(JwtAccessGuard)
  @AllowPendingPasswordChange()
  closeSession(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sesion: string,
  ) {
    const { sub, sessionId } = this.sinSoporte(request);
    return this.auth.cerrarSesionesPropias(sub, sessionId, sesion);
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
