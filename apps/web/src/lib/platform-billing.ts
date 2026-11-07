import type { StatusTone } from "../data-table";
import { ars } from "../supplier-payables/api";
import { PlatformApiError } from "./platform-api";

type Balance = { balanceMinor: string; creditMinor: string };

export function balanceLabel({ balanceMinor, creditMinor }: Balance): string {
  if (BigInt(balanceMinor) > 0n) return `Debe ${ars(balanceMinor)}`;
  if (BigInt(creditMinor) > 0n) return `A favor ${ars(creditMinor)}`;
  return "Sin deuda";
}

/** Solo es una vista previa: la imputación la hace la API. */
export function balanceAfterPayment(
  balance: Balance,
  amountMinor: string,
): string {
  const net =
    BigInt(balance.balanceMinor) -
    BigInt(balance.creditMinor) -
    BigInt(amountMinor);
  return balanceLabel({
    balanceMinor: (net > 0n ? net : 0n).toString(),
    creditMinor: (net < 0n ? -net : 0n).toString(),
  });
}

export function chargeStatus(charge: {
  amountMinor: string;
  paidMinor: string;
  balanceMinor: string;
  waived: boolean;
}): { label: string; tone: StatusTone } {
  if (charge.waived) return { label: "Condonado", tone: "muted" };
  if (BigInt(charge.balanceMinor) === 0n)
    return { label: "Pagado", tone: "ok" };
  if (BigInt(charge.paidMinor) > 0n)
    return { label: "Pago parcial", tone: "warning" };
  return { label: "Pendiente", tone: "danger" };
}

/** Quién debe, de la deuda más grande a la más chica. */
export function debtors<T extends { balanceMinor: string }>(
  rows: readonly T[],
): T[] {
  return rows
    .filter(({ balanceMinor }) => BigInt(balanceMinor) > 0n)
    .sort((first, second) => {
      const difference =
        BigInt(second.balanceMinor) - BigInt(first.balanceMinor);
      return difference > 0n ? 1 : difference < 0n ? -1 : 0;
    });
}

export const totalDebtMinor = (rows: readonly { balanceMinor: string }[]) =>
  rows
    .reduce((sum, { balanceMinor }) => sum + BigInt(balanceMinor), 0n)
    .toString();

/** Sin una respuesta clara de la API no se sabe si el pago quedó registrado. */
export const paymentOutcomeUnknown = (cause: unknown) =>
  !(cause instanceof PlatformApiError) || cause.status >= 500;
