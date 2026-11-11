import type { Request } from "express";

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  email: string;
  /**
   * Sesión de soporte (SISTEMA-89): un superadmin de la plataforma entró como
   * este usuario. Va firmado en el token: nadie puede agregarlo desde afuera.
   */
  soporte?: { adminId: string };
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenPayload;
}
