import { BadRequestException } from "@nestjs/common";

export type TotalDebtInput = {
  expectedPendingMinor: number;
  nextPendingMinor: number;
  expectedItems: { saleItemId: string; pendingMinor: string }[];
  reason: string;
  clientOperationId: string;
};

export function distributeDebtIncrease(input: TotalDebtInput) {
  const { expectedPendingMinor: current, nextPendingMinor: next } = input;
  if (
    !Number.isSafeInteger(current) ||
    current <= 0 ||
    !Number.isSafeInteger(next) ||
    next <= current ||
    input.reason.trim().length < 3 ||
    input.reason.trim().length > 300
  )
    throw new BadRequestException(
      "Ingresá un saldo mayor al actual y un motivo válido.",
    );
  const items = [...input.expectedItems].sort((a, b) =>
    a.saleItemId.localeCompare(b.saleItemId),
  );
  if (
    !items.length ||
    new Set(items.map((item) => item.saleItemId)).size !== items.length ||
    items.some((item) => !/^[1-9]\d*$/.test(item.pendingMinor))
  )
    throw new BadRequestException("Detalle de saldo inválido.");
  const sum = items.reduce(
    (total, item) => total + BigInt(item.pendingMinor),
    0n,
  );
  if (sum !== BigInt(current))
    throw new BadRequestException(
      "El detalle no coincide con el saldo pendiente.",
    );
  const increase = BigInt(next) - sum;
  let cumulative = 0n;
  let assigned = 0n;
  return items.map((item) => {
    cumulative += BigInt(item.pendingMinor);
    const target = (increase * cumulative + sum / 2n) / sum;
    const amountMinor = target - assigned;
    assigned = target;
    return {
      ...item,
      amountMinor: amountMinor.toString(),
      unitPriceMinor: "0",
    };
  });
}
