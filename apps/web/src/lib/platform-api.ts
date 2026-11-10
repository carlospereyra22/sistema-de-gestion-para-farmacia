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
  nextCut: {
    access: "READ_ONLY" | "BLOCKED";
    on: string;
    inDays: number;
  } | null;
  exempt: boolean;
  trialEndsAt: string | null;
  paidThrough: string | null;
  extendedUntil: string | null;
  extendedReason: string | null;
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
  balanceMinor: string;
  activeBranches: number;
  activeUsers: number;
  subscription: PlatformSubscription | null;
};
export type PlatformCharge = {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: string;
  paidMinor: string;
  balanceMinor: string;
  waived: boolean;
  waiveReason: string | null;
};
export type PlatformPayment = {
  id: string;
  amountMinor: string;
  paidOn: string;
  method: string;
  reference: string | null;
  voided: boolean;
  voidReason: string | null;
};
export type PlatformBilling = {
  today: string;
  balanceMinor: string;
  creditMinor: string;
  charges: PlatformCharge[];
  payments: PlatformPayment[];
};
export type PlatformPaymentInput = {
  operationId: string;
  amountMinor: string;
  paidOn: string;
  method: string;
  reference: string;
};
export type PlatformRecentPayment = PlatformPayment & {
  organizationId: string;
  organizationName: string;
};
export type PlatformPaymentsOverview = {
  collectedThisMonthMinor: string;
  payments: PlatformRecentPayment[];
};
export type PlatformOrganizationDetail = {
  id: string;
  name: string;
  createdAt: string;
  billing: PlatformBilling;
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
  }).catch(() => {
    throw new Error("No hubo respuesta del servidor. Revisá la conexión.");
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
      : response.status >= 500
        ? "El servidor no pudo completar la operación."
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

export const getPlatformPayments = (token: string) =>
  platformRequest<PlatformPaymentsOverview>(token, "/payments");

export const registerPlatformPayment = (
  token: string,
  organizationId: string,
  input: PlatformPaymentInput,
) =>
  platformRequest<{ id: string }>(
    token,
    `/organizations/${organizationId}/payments`,
    input,
  );

export const voidPlatformPayment = (
  token: string,
  organizationId: string,
  paymentId: string,
  reason: string,
) =>
  platformRequest<{ id: string }>(
    token,
    `/organizations/${organizationId}/payments/${paymentId}/void`,
    { reason },
  );

export const waivePlatformCharge = (
  token: string,
  organizationId: string,
  chargeId: string,
  reason: string,
) =>
  platformRequest<{ id: string }>(
    token,
    `/organizations/${organizationId}/charges/${chargeId}/waive`,
    { reason },
  );

export const extendPlatformSubscription = (
  token: string,
  organizationId: string,
  input: { until: string | null; reason: string },
) =>
  platformRequest<{ extendedUntil: string | null }>(
    token,
    `/organizations/${organizationId}/extension`,
    input,
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

/** Certificado de Farmatec para el padrón de ARCA (SISTEMA-70). */
export type PadronAmbiente = "HOMOLOGATION" | "PRODUCTION";
export type PlatformPadronStatus = {
  environment: PadronAmbiente;
  cuit: string;
  version: number;
  hasRequest: boolean;
  hasCertificate: boolean;
  fingerprint: string | null;
  expiresAt: string | null;
  storage: string;
};

export const getPlatformPadron = (token: string, environment: PadronAmbiente) =>
  platformRequest<PlatformPadronStatus>(
    token,
    `/padron-certificado?environment=${environment}`,
  );

export const preparePlatformPadron = (
  token: string,
  input: {
    environment: PadronAmbiente;
    cuit: string;
    expectedVersion: number;
    replace?: boolean;
  },
) =>
  platformRequest<PlatformPadronStatus>(
    token,
    "/padron-certificado/solicitud",
    input,
  );

export const getPlatformPadronRequest = (
  token: string,
  environment: PadronAmbiente,
) =>
  platformRequest<{ csr: string; filename: string }>(
    token,
    `/padron-certificado/solicitud?environment=${environment}`,
  );

export const uploadPlatformPadron = (
  token: string,
  input: {
    environment: PadronAmbiente;
    certificate: string;
    expectedVersion: number;
  },
) =>
  platformRequest<PlatformPadronStatus>(
    token,
    "/padron-certificado/certificado",
    input,
  );
