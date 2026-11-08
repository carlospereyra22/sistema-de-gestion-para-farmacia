import { HttpException, HttpStatus, SetMetadata } from "@nestjs/common";

import type {
  SubscriptionAccessLevel,
  SubscriptionStage,
} from "./subscription-access";

export const SUBSCRIPTION_RULE = "subscription-rule";

export type SubscriptionRule =
  "READ_ONLY" | "OWNER_WHEN_BLOCKED" | "ALWAYS" | "OFFLINE_SYNC";

/** Sigue funcionando en solo lectura: termina algo pendiente sin abrir operaciones nuevas. */
export const AllowWhenReadOnly = () =>
  SetMetadata(SUBSCRIPTION_RULE, "READ_ONLY" satisfies SubscriptionRule);

/** Lectura que el dueño conserva con la farmacia bloqueada: sus ventas y comprobantes. */
export const AllowOwnerWhenBlocked = () =>
  SetMetadata(
    SUBSCRIPTION_RULE,
    "OWNER_WHEN_BLOCKED" satisfies SubscriptionRule,
  );

/** Nunca se corta: es lo que le muestra a la farmacia cómo regularizar. */
export const AlwaysAvailable = () =>
  SetMetadata(SUBSCRIPTION_RULE, "ALWAYS" satisfies SubscriptionRule);

/**
 * Operaciones hechas sin conexión que se sincronizan después: el servicio decide
 * con el estado que tenía la farmacia cuando ocurrieron (`subscriptionAccessAt`),
 * no con el de hoy. Una venta hecha antes del corte se acepta.
 */
export const DecidedWhenOccurred = () =>
  SetMetadata(SUBSCRIPTION_RULE, "OFFLINE_SYNC" satisfies SubscriptionRule);

export type SubscriptionRestriction =
  "NONE" | "READ_ONLY" | "BLOCKED" | "OWNER_ONLY";

/**
 * Qué impide el estado de la farmacia en esta ruta. Las lecturas pasan en solo lectura;
 * las escrituras, solo las marcadas. Bloqueada, solo lo marcado para el dueño.
 */
export function subscriptionRestriction(
  access: SubscriptionAccessLevel,
  method: string,
  rule: SubscriptionRule | undefined,
): SubscriptionRestriction {
  if (access === "FULL" || rule === "ALWAYS" || rule === "OFFLINE_SYNC")
    return "NONE";
  const read = method === "GET" || method === "HEAD";
  if (access === "READ_ONLY")
    return read || rule === "READ_ONLY" ? "NONE" : "READ_ONLY";
  return read && rule === "OWNER_WHEN_BLOCKED" ? "OWNER_ONLY" : "BLOCKED";
}

const blockedMessages: Partial<Record<SubscriptionStage, string>> = {
  SUSPENDED: "La farmacia está suspendida.",
  CANCELLED: "La farmacia está dada de baja.",
};

/** 402 con código: la web lo distingue de un error y muestra cómo regularizar. */
export function subscriptionDenied(
  restriction: "READ_ONLY" | "BLOCKED",
  stage: SubscriptionStage,
) {
  return new HttpException(
    restriction === "READ_ONLY"
      ? {
          error: "SUBSCRIPTION_READ_ONLY",
          message:
            "La farmacia está en solo lectura por falta de pago: podés consultar y terminar lo pendiente, pero no registrar operaciones nuevas.",
        }
      : {
          error: "SUBSCRIPTION_BLOCKED",
          message:
            blockedMessages[stage] ??
            "La farmacia está bloqueada por falta de pago.",
        },
    HttpStatus.PAYMENT_REQUIRED,
  );
}
