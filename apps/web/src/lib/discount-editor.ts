type Payment = {
  method: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT";
  amountMinor: number;
};

export function discountDraft(minor: number): string {
  return minor === 0 ? "" : (minor / 100).toFixed(2).replace(".", ",");
}

export function parseDiscountDraft(value: string): number | undefined {
  const text = value.trim();
  if (!text) return 0;
  if (
    !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text) &&
    !/^\d+\.\d{1,2}$/.test(text)
  )
    return undefined;
  const normalized =
    text.includes(",") || /^\d{1,3}(?:\.\d{3})+$/.test(text)
      ? text.replace(/\./g, "").replace(",", ".")
      : text;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

// Account is a pending financing allocation, not money received. Never silently
// alter amounts already recorded as cash, card or transfer in the draft.
export function paymentsAfterDiscount(
  total: number,
  payments: readonly Payment[],
): Payment[] {
  const others = payments.filter((payment) => payment.method !== "ACCOUNT");
  const otherPaid = others.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0,
  );
  let accountRemaining = Math.max(total - otherPaid, 0);
  const next = payments.flatMap((payment) => {
    if (payment.method !== "ACCOUNT") return [{ ...payment }];
    const amountMinor = Math.min(payment.amountMinor, accountRemaining);
    accountRemaining -= amountMinor;
    return amountMinor > 0 ? [{ ...payment, amountMinor }] : [];
  });
  const paid = next.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const cash = next
    .filter((payment) => payment.method === "CASH")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  if (paid - total > cash)
    throw new Error(
      "El descuento deja un excedente en tarjeta o transferencia. Ajustá o quitá ese pago antes de aplicar el descuento.",
    );
  return next;
}
