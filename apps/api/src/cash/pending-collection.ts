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

/**
 * ¿Sin caja, este cobro queda pendiente de asignar? Sí, salvo que todo sea a
 * cuenta corriente (o el efectivo se vaya entero en vuelto).
 */
export function cobroQuedaPendiente(
  payments: readonly { method: string; amountMinor: number | bigint }[],
  changeMinor: bigint = 0n,
) {
  const totals = pendingAmounts(payments, changeMinor);
  return totals.cashMinor + totals.cardMinor + totals.transferMinor > 0n;
}

export async function recordPendingCollection(
  tx: Prisma.TransactionClient,
  scope: {
    organizationId: string;
    branchId: string;
    actorId: string;
    sourceType: "SALE" | "RECEIPT";
    sourceId: string;
    /** Cobro hecho sin conexión: cuándo ocurrió de verdad. */
    collectedAt?: Date;
  },
  payments: readonly { method: string; amountMinor: number | bigint }[],
  changeMinor = 0n,
) {
  if (!cobroQuedaPendiente(payments, changeMinor)) return;
  await tx.cashPendingCollection.create({
    data: { ...scope, ...pendingAmounts(payments, changeMinor) },
  });
}
