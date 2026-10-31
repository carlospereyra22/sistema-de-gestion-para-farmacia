import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export type ItemAllocation = {
  saleItemId: string;
  amountMinor: number;
  expectedPendingMinor?: number;
  nextPendingMinor?: number;
};
export function readAllocations(
  value: Prisma.JsonValue | null,
): ItemAllocation[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.kind === "MIXED_RECEIPT"
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
