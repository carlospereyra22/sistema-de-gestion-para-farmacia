import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

// Venta hecha sin conexión (SISTEMA-63). La venta ya ocurrió y el cliente ya
// pagó: al sincronizar se registra igual y lo que haya cambiado mientras no
// había conexión queda como aviso "a revisar". Nunca stock negativo.

/** Una venta más vieja que esto se rechaza para revisarla a mano. */
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerancia al reloj de la PC. */
export const OFFLINE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type OfflineIssueKind =
  | "PRECIO_DISTINTO"
  | "STOCK_FALTANTE"
  | "PRODUCTO_NO_DISPONIBLE"
  | "CLIENTE_INACTIVO"
  | "LISTA_INACTIVA"
  | "LIMITE_CREDITO"
  | "CAJA_CERRADA"
  | "FACTURA_NO_PREPARADA";

export type OfflineIssue = {
  kind: OfflineIssueKind;
  detail: Record<string, string | number | null>;
};

export type OfflineSaleContext = {
  occurredAt: Date;
  deviceId: string;
  requestHash: string;
  issues: OfflineIssue[];
};

/** Fecha y hora en que se hizo la venta, validada contra el reloj del servidor. */
export function offlineOccurredAt(value: string, now: Date): Date {
  const occurredAt = new Date(value);
  if (!Number.isFinite(occurredAt.getTime()))
    throw new BadRequestException(
      "La fecha de la venta sin conexión no es válida.",
    );
  if (occurredAt.getTime() > now.getTime() + OFFLINE_CLOCK_SKEW_MS)
    throw new BadRequestException(
      "La venta sin conexión tiene una fecha futura. Revisá la hora de la PC.",
    );
  if (now.getTime() - occurredAt.getTime() > OFFLINE_MAX_AGE_MS)
    throw new BadRequestException(
      "La venta sin conexión tiene más de 7 días. Registrala a mano y revisá el stock.",
    );
  return occurredAt;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/**
 * Huella del contenido de negocio de la venta. No incluye cuándo ni desde qué
 * PC se mandó: el mismo pedido reintentado da la misma huella.
 */
export function offlineRequestHash(input: {
  documentType?: string;
  fiscalEnvironment?: string;
  fiscalOptions?: unknown;
  priceListId?: string;
  customerId?: string;
  items: readonly unknown[];
  payments: readonly unknown[];
}): string {
  const business = {
    documentType: input.documentType ?? "INTERNAL",
    fiscalEnvironment: input.fiscalEnvironment,
    fiscalOptions: input.fiscalOptions,
    priceListId: input.priceListId,
    customerId: input.customerId,
    items: input.items,
    payments: input.payments,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(business)))
    .digest("hex");
}

/** Descripción del renglón cuando el producto ya no se puede vender. */
export function offlineConceptName(name: string | undefined) {
  const clean = [...(name ?? "")]
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .trim()
    .slice(0, 140);
  return clean.length >= 3
    ? clean
    : `Producto vendido sin conexión ${clean}`.trim();
}
