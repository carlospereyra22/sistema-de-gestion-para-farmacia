import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

// Caja sin conexión (SISTEMA-67): aperturas, movimientos y cierres hechos sin
// internet que la PC manda al volver, en el orden en que pasaron.

export type TipoOperacionCaja =
  | "APERTURA"
  | "MOVIMIENTO"
  | "CIERRE"
  // Cobros pendientes de caja (SISTEMA-81): asignar caja, incorporar a una
  // sesión o quitar la caja.
  | "COBRO_DESTINO"
  | "COBRO_INCORPORAR"
  | "COBRO_QUITAR";

export type OperacionCajaSinConexion = {
  tipo: TipoOperacionCaja;
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
  /** Apertura. */
  cashRegisterId?: string;
  openingAmountMinor?: number;
  /** Movimiento y cierre: la sesión (o el id de una apertura sin conexión). */
  sessionId?: string;
  /** Movimiento. */
  type?: "IN" | "OUT";
  amountMinor?: number;
  reason?: string;
  /** Cierre. */
  closingAmountMinor?: number;
  /** Cierre: el esperado que mostraba la PC. */
  expectedAmountMinor?: number;
  /** Cobro pendiente (SISTEMA-81). */
  collectionId?: string;
  /** Quitar la caja: la que tenía asignada según la PC. */
  expectedRegisterId?: string;
};

export const TIPOS_DE_COBRO: readonly TipoOperacionCaja[] = [
  "COBRO_DESTINO",
  "COBRO_INCORPORAR",
  "COBRO_QUITAR",
];

export const KIND_POR_TIPO = {
  APERTURA: "CASH_OPEN",
  MOVIMIENTO: "CASH_MOVEMENT",
  CIERRE: "CASH_CLOSE",
  COBRO_DESTINO: "CASH_COLLECTION_DESTINATION",
  COBRO_INCORPORAR: "CASH_COLLECTION_ASSIGN",
  COBRO_QUITAR: "CASH_COLLECTION_CLEAR",
} as const;

const entero = (valor: number | undefined, minimo: number) =>
  valor !== undefined && Number.isSafeInteger(valor) && valor >= minimo;

/** Revisa que la operación traiga lo que su tipo necesita. */
export function validarOperacionCaja(op: OperacionCajaSinConexion) {
  const invalida = (motivo: string) => {
    throw new BadRequestException(motivo);
  };
  if (TIPOS_DE_COBRO.includes(op.tipo)) {
    if (!op.collectionId) invalida("Falta el cobro pendiente.");
    if (op.tipo === "COBRO_DESTINO" && !op.cashRegisterId)
      invalida("Falta la caja del cobro.");
    if (op.tipo === "COBRO_INCORPORAR" && !op.sessionId)
      invalida("Falta la sesión de caja.");
    if (op.tipo === "COBRO_QUITAR" && !op.expectedRegisterId)
      invalida("Falta la caja que tenía el cobro.");
    return;
  }
  if (op.tipo === "APERTURA") {
    if (!op.cashRegisterId) invalida("Falta la caja de la apertura.");
    if (!entero(op.openingAmountMinor, 0))
      invalida("El fondo inicial no es válido.");
  } else if (!op.sessionId) invalida("Falta la sesión de caja.");
  if (op.tipo === "MOVIMIENTO") {
    if (op.type !== "IN" && op.type !== "OUT")
      invalida("El movimiento tiene que ser ingreso o egreso.");
    if (!entero(op.amountMinor, 1))
      invalida("El importe del movimiento tiene que ser positivo.");
  }
  if (op.tipo === "CIERRE") {
    if (!entero(op.closingAmountMinor, 0))
      invalida("El efectivo contado no es válido.");
    if (!entero(op.expectedAmountMinor, Number.MIN_SAFE_INTEGER))
      invalida("Falta el efectivo esperado que mostraba la PC.");
  }
}

/** Huella de los datos de negocio: el mismo id con otros datos es un error. */
export function hashOperacionCaja(op: OperacionCajaSinConexion) {
  const negocio = {
    tipo: op.tipo,
    cashRegisterId: op.cashRegisterId ?? null,
    openingAmountMinor: op.openingAmountMinor ?? null,
    sessionId: op.sessionId ?? null,
    type: op.type ?? null,
    amountMinor: op.amountMinor ?? null,
    reason: op.reason?.trim() ?? null,
    closingAmountMinor: op.closingAmountMinor ?? null,
    expectedAmountMinor: op.expectedAmountMinor ?? null,
    // Las anteriores no los tienen: no cambia su huella (SISTEMA-81).
    ...(op.collectionId ? { collectionId: op.collectionId } : {}),
    ...(op.expectedRegisterId
      ? { expectedRegisterId: op.expectedRegisterId }
      : {}),
  };
  return createHash("sha256").update(JSON.stringify(negocio)).digest("hex");
}

/**
 * Sesión real de una caja abierta sin conexión: la PC usa el id de su
 * apertura; si al llegar esa caja ya estaba abierta por otra PC, la apertura
 * quedó apuntando a esa sesión.
 */
export async function sesionReal(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sessionId: string,
) {
  const apertura = await tx.offlineOperation.findFirst({
    where: { id: sessionId, organizationId, kind: "CASH_OPEN" },
    select: { entityId: true },
  });
  return apertura?.entityId ?? sessionId;
}
