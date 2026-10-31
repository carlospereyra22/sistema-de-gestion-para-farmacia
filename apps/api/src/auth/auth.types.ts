import type { Request } from "express";

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenPayload;
}
