import { apiBaseUrl } from "./api";
import type { SubscriptionStage } from "./platform-subscription";

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
export type PlatformSubscription = {
  stage: SubscriptionStage;
  access: "FULL" | "READ_ONLY" | "BLOCKED";
  daysOverdue: number;
  exempt: boolean;
  trialEndsAt: string | null;
  paidThrough: string | null;
  extendedUntil: string | null;
  extraUsers: number;
  extraBranches: number;
  agreedPriceMinor: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  feeMinor: string;
  quota: { users: number; branches: number };
};
export type PlatformOrganization = {
  id: string;
  name: string;
  createdAt: string;
  activeBranches: number;
  activeUsers: number;
  subscription: PlatformSubscription | null;
};
export type PlatformOrganizationDetail = {
  id: string;
  name: string;
  createdAt: string;
  subscription: PlatformSubscription | null;
  branches: { id: string; name: string; code: string; active: boolean }[];
  roles: { code: string; name: string }[];
  users: {
    id: string;
    email: string;
    active: boolean;
    displayName: string | null;
    mustChangePassword: boolean;
    roles: { code: string; name: string }[];
  }[];
};
export type PlatformTemporaryAccess = {
  email: string;
  temporaryPassword: string;
};
export type PlatformOrganizationCreated = PlatformTemporaryAccess & {
  id: string;
  name: string;
};
export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  baseMinor: string;
  extraUserMinor: string;
  extraBranchMinor: string;
  includedUsers: number;
  includedBranches: number;
};

async function platformRequest<T>(
  token: string,
  path: string,
  body?: object,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/platform${path}`, {
    method,
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

export const getPlatformOrganizations = (token: string) =>
  platformRequest<PlatformOrganization[]>(token, "/organizations");

export const getPlatformOrganization = (token: string, id: string) =>
  platformRequest<PlatformOrganizationDetail>(token, `/organizations/${id}`);

export const createPlatformOrganization = (
  token: string,
  input: {
    organizationName: string;
    branchName: string;
    ownerEmail: string;
    trialDays: number;
    contactName: string;
    contactPhone: string;
  },
) =>
  platformRequest<PlatformOrganizationCreated>(token, "/organizations", input);

export const addPlatformUser = (
  token: string,
  organizationId: string,
  input: { email: string; displayName: string; roleCode: string },
) =>
  platformRequest<PlatformTemporaryAccess>(
    token,
    `/organizations/${organizationId}/users`,
    input,
  );

export const addPlatformBranch = (
  token: string,
  organizationId: string,
  input: { name: string },
) =>
  platformRequest<{ id: string }>(
    token,
    `/organizations/${organizationId}/branches`,
    input,
  );

export const resetPlatformUserPassword = (
  token: string,
  organizationId: string,
  userId: string,
) =>
  platformRequest<PlatformTemporaryAccess>(
    token,
    `/organizations/${organizationId}/users/${userId}/reset-password`,
    {},
  );

export const updatePlatformSubscription = (
  token: string,
  organizationId: string,
  input: {
    extraUsers: number;
    extraBranches: number;
    agreedPriceMinor: string | null;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  },
) =>
  platformRequest<PlatformSubscription>(
    token,
    `/organizations/${organizationId}/subscription`,
    input,
    "PATCH",
  );

export const getPlatformPlans = (token: string) =>
  platformRequest<PlatformPlan[]>(token, "/plans");

export const updatePlatformPlan = (
  token: string,
  planId: string,
  input: {
    baseMinor: string;
    extraUserMinor: string;
    extraBranchMinor: string;
  },
) => platformRequest<{ id: string }>(token, `/plans/${planId}`, input, "PATCH");
