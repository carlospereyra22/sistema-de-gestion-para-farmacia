import type { Prisma } from "@prisma/client";
export function priceAdjustments(
  value: Prisma.JsonValue | null,
): { saleItemId: string; amountMinor: bigint; unitPriceMinor: bigint }[] {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value.kind !== "PRICE_ADJUSTMENT" &&
      value.kind !== "MANUAL_DEBT_ADJUSTMENT") ||
    !Array.isArray(value.items)
  )
    return [];
  return value.items.flatMap((item) =>
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof item.saleItemId === "string" &&
    typeof item.amountMinor === "string" &&
    typeof item.unitPriceMinor === "string"
      ? [
          {
            saleItemId: item.saleItemId,
            amountMinor: BigInt(item.amountMinor),
            unitPriceMinor: BigInt(item.unitPriceMinor),
          },
        ]
      : [],
  );
}
export function priceIncrease(
  pending: bigint,
  previous: bigint,
  next: bigint,
): bigint {
  return pending > 0n && previous > 0n && next > previous
    ? (pending * (next - previous) + previous / 2n) / previous
    : 0n;
}
