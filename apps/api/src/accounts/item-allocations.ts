import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export type ItemAllocation = {
  saleItemId: string;
  amountMinor: number;
  expectedPendingMinor?: number;
  nextPendingMinor?: number;
};
/**
 * Saldo a favor de una nota de crédito (SISTEMA-110): crédito de cuenta
 * corriente cuyas imputaciones (`items`) se van sumando a medida que se
 * descuenta de lo que el cliente debe. Lo no imputado sigue a favor. No es un
 * cobro sin asignar: no pide conciliación.
 */
export const SALDO_A_FAVOR = "SALDO_A_FAVOR";

export function esSaldoAFavor(value: Prisma.JsonValue | null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.kind === SALDO_A_FAVOR,
  );
}

/** Lo que todavía queda a favor de un crédito de saldo a favor. */
export function saldoAFavorDisponible(movement: {
  amountMinor: bigint;
  allocations: Prisma.JsonValue | null;
}) {
  if (!esSaldoAFavor(movement.allocations)) return 0n;
  const usado = readAllocations(movement.allocations).reduce(
    (total, item) => total + BigInt(item.amountMinor),
    0n,
  );
  return movement.amountMinor > usado ? movement.amountMinor - usado : 0n;
}

/**
 * Cómo se descuenta un saldo a favor de lo que se debe: de lo más viejo a lo
 * más nuevo, hasta agotar el saldo o la deuda.
 */
export function repartirSaldoAFavor(
  disponible: bigint,
  pendientes: { saleItemId: string; pendingMinor: bigint }[],
): ItemAllocation[] {
  const imputaciones: ItemAllocation[] = [];
  let resto = disponible;
  for (const pendiente of pendientes) {
    if (resto <= 0n) break;
    const monto =
      pendiente.pendingMinor < resto ? pendiente.pendingMinor : resto;
    if (monto <= 0n) continue;
    imputaciones.push({
      saleItemId: pendiente.saleItemId,
      amountMinor: Number(monto),
    });
    resto -= monto;
  }
  return imputaciones;
}

export function readAllocations(
  value: Prisma.JsonValue | null,
): ItemAllocation[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.kind === "MIXED_RECEIPT" || value.kind === SALDO_A_FAVOR)
  )
    value = value.items ?? null;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof item.saleItemId === "string" &&
    typeof item.amountMinor === "number"
      ? [
          {
            saleItemId: item.saleItemId,
            amountMinor: item.amountMinor,
            ...(typeof item.expectedPendingMinor === "number"
              ? { expectedPendingMinor: item.expectedPendingMinor }
              : {}),
            ...(typeof item.nextPendingMinor === "number"
              ? { nextPendingMinor: item.nextPendingMinor }
              : {}),
          },
        ]
      : [],
  );
}
export function validateAllocations(
  allocations: ItemAllocation[],
  amountMinor: number,
  pending: Map<string, bigint>,
) {
  if (
    !allocations.length ||
    new Set(allocations.map((item) => item.saleItemId)).size !==
      allocations.length
  )
    throw new BadRequestException("Seleccioná artículos sin repetirlos.");
  let total = 0n;
  for (const item of allocations) {
    if (!Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0)
      throw new BadRequestException("Ingresá un importe válido por artículo.");
    const available = pending.get(item.saleItemId);
    if (available === undefined || BigInt(item.amountMinor) > available)
      throw new BadRequestException(
        "Uno de los artículos no corresponde a esta cuenta o el importe supera su saldo pendiente. Actualizá la selección.",
      );
    total += BigInt(item.amountMinor);
  }
  if (total !== BigInt(amountMinor))
    throw new BadRequestException(
      "La suma de los artículos debe coincidir con el importe del cobro.",
    );
}
