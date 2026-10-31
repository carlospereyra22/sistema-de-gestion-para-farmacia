import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
export type ReceiptPayment = {
  method: "CASH" | "CARD" | "TRANSFER";
  amountMinor: number;
};
export function normalizeReceiptPayments(
  amount: number,
  method: string,
  payments?: ReceiptPayment[],
): ReceiptPayment[] {
  const rows = payments ?? [{ method, amountMinor: amount }];
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !rows.length ||
    rows.length > 3 ||
    new Set(rows.map((row) => row.method)).size !== rows.length ||
    rows.some(
      (row) =>
        !["CASH", "CARD", "TRANSFER"].includes(row.method) ||
        !Number.isSafeInteger(row.amountMinor) ||
        row.amountMinor <= 0,
    ) ||
    rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) !==
      BigInt(amount)
  )
    throw new BadRequestException(
      "Los medios de pago deben ser válidos y sumar exactamente el total a cobrar.",
    );
  if (payments && method !== (rows.length > 1 ? "OTHER" : rows[0]!.method))
    throw new BadRequestException(
      "El medio de pago no coincide con el desglose.",
    );
  return [...rows].sort((a, b) =>
    a.method.localeCompare(b.method),
  ) as ReceiptPayment[];
}
export function readReceiptPayments(
  value: Prisma.JsonValue | null,
): ReceiptPayment[] | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.kind !== "MIXED_RECEIPT" ||
    !Array.isArray(value.payments)
  )
    return undefined;
  return value.payments.flatMap((row) =>
    row &&
    typeof row === "object" &&
    !Array.isArray(row) &&
    (row.method === "CASH" ||
      row.method === "CARD" ||
      row.method === "TRANSFER") &&
    typeof row.amountMinor === "number"
      ? [{ method: row.method, amountMinor: row.amountMinor }]
      : [],
  );
}
