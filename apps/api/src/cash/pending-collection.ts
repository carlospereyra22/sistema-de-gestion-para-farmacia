import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export function pendingAmounts(
  payments: readonly { method: string; amountMinor: number | bigint }[],
  changeMinor: bigint = 0n,
) {
  const sum = (method: string) =>
    payments
      .filter((p) => p.method === method)
      .reduce((total, p) => total + BigInt(p.amountMinor), 0n);
  const cashMinor = sum("CASH") - changeMinor;
  if (cashMinor < 0n || changeMinor < 0n)
    throw new BadRequestException(
      "El vuelto no puede superar el efectivo recibido.",
    );
  return {
    cashMinor,
    cardMinor: sum("CARD"),
    transferMinor: sum("TRANSFER"),
    changeMinor,
  };
}

export async function recordPendingCollection(
  tx: Prisma.TransactionClient,
  scope: {
    organizationId: string;
    branchId: string;
    actorId: string;
    sourceType: "SALE" | "RECEIPT";
    sourceId: string;
  },
  payments: readonly { method: string; amountMinor: number | bigint }[],
  changeMinor = 0n,
) {
  const totals = pendingAmounts(payments, changeMinor);
  if (totals.cashMinor + totals.cardMinor + totals.transferMinor === 0n) return;
  await tx.cashPendingCollection.create({ data: { ...scope, ...totals } });
}
