type Payment = {
  method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT";
  amountMinor: number;
};
type Credit = {
  active: boolean;
  creditEnabled: boolean;
  creditLimitMinor: string | null;
  balanceMinor: string;
};

// Only prepares the payment; the API remains the authority at confirmation.
export function prepareAccountPayment(
  total: number,
  payments: Payment[],
  account?: Credit,
): Payment[] {
  if (!account?.active || !account.creditEnabled)
    throw new Error("Seleccioná un cliente con cuenta corriente habilitada.");
  const otherPayments = payments.filter(
    (payment) => payment.method !== "ACCOUNT",
  );
  const remaining =
    total -
    otherPayments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  if (remaining <= 0)
    throw new Error(
      "La venta ya está completamente cubierta por otros medios de pago.",
    );
  if (
    account.creditLimitMinor !== null &&
    remaining > Number(account.creditLimitMinor) - Number(account.balanceMinor)
  )
    throw new Error(
      "El saldo pendiente supera el crédito disponible del cliente.",
    );
  return [...otherPayments, { method: "ACCOUNT", amountMinor: remaining }];
}
