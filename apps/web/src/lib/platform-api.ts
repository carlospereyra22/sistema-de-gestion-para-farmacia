import { apiBaseUrl } from "./api";

export class PlatformApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type PlatformSession = { enrolled: boolean; verified: boolean };
export type PlatformEnrollment = { secret: string; uri: string };
export type PlatformAuditEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  createdAt: string;
};

async function platformRequest<T>(
  token: string,
  path: string,
  body?: object,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/platform${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return (await response.json()) as T;
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
  };
  // La API responde 404 a quien no tiene acceso: su texto no le sirve al usuario.
  const message =
    response.status === 404
      ? "Tu acceso a la plataforma ya no está disponible. Volvé a iniciar sesión."
      : Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? "No se pudo completar la operación.");
  throw new PlatformApiError(message, response.status, result.code);
}

export const getPlatformSession = (token: string) =>
  platformRequest<PlatformSession>(token, "/session");

export const enrollPlatformCode = (token: string) =>
  platformRequest<PlatformEnrollment>(token, "/totp/enroll", {});

export const confirmPlatformCode = (token: string, code: string) =>
  platformRequest<{ verified: boolean }>(token, "/totp/confirm", { code });

export const verifyPlatformCode = (token: string, code: string) =>
  platformRequest<{ verified: boolean }>(token, "/totp/verify", { code });

export const getPlatformAudit = (token: string) =>
  platformRequest<PlatformAuditEntry[]>(token, "/audit");
