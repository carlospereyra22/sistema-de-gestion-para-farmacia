import { BadRequestException } from "@nestjs/common";
import type { ItemAllocation } from "./item-allocations";

export function settlementAdjustments(
  allocations: ItemAllocation[],
  pending: Map<string, bigint>,
) {
  return allocations.flatMap((item) => {
    if (item.expectedPendingMinor === undefined) {
      if (item.nextPendingMinor !== undefined)
        throw new BadRequestException("Falta el saldo esperado del ajuste.");
      return [];
    }
    const nextPendingMinor = item.nextPendingMinor ?? item.amountMinor;
    if (
      !Number.isSafeInteger(item.expectedPendingMinor) ||
      item.expectedPendingMinor <= 0 ||
      !Number.isSafeInteger(item.amountMinor) ||
      item.amountMinor <= 0 ||
      !Number.isSafeInteger(nextPendingMinor) ||
      nextPendingMinor <= 0 ||
      item.amountMinor > nextPendingMinor ||
      pending.get(item.saleItemId) !== BigInt(item.expectedPendingMinor)
    )
      throw new BadRequestException(
        "Cambió el saldo del artículo o el importe no es válido. Actualizá la cuenta.",
      );
    return [
      {
        saleItemId: item.saleItemId,
        before: BigInt(item.expectedPendingMinor),
        after: BigInt(nextPendingMinor),
        delta: BigInt(nextPendingMinor) - BigInt(item.expectedPendingMinor),
      },
    ];
  });
}
