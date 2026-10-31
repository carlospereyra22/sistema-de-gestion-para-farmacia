import { BadRequestException } from "@nestjs/common";
export const paymentMethods = ["CASH", "TRANSFER", "CHECK", "OTHER"] as const;
export type PaymentInput = {
  operationId: string;
  amountMinor: string;
  expectedBalanceMinor: string;
  paidOn: string;
  method: string;
  reference?: string;
};
export function allocatePayment(
  dues: {
    id: string;
    sequence: number;
    dueOn: Date | null;
    balanceMinor: bigint;
  }[],
  amount: bigint,
) {
  let remaining = amount;
  const allocations: { dueId: string; amountMinor: bigint }[] = [];
  for (const due of [...dues].sort(
    (a, b) =>
      (a.dueOn?.getTime() ?? Infinity) - (b.dueOn?.getTime() ?? Infinity) ||
      a.sequence - b.sequence,
  )) {
    const applied = remaining < due.balanceMinor ? remaining : due.balanceMinor;
    if (applied > 0n) {
      allocations.push({ dueId: due.id, amountMinor: applied });
      remaining -= applied;
    }
  }
  if (amount <= 0n || remaining !== 0n)
    throw new BadRequestException(
      "El pago debe ser positivo y no superar el saldo pendiente.",
    );
  return allocations;
}
