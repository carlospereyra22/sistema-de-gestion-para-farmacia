export function AccountPaymentSummary({
  balanceMinor,
  amountMinor,
  valid,
  adjustmentMinor = 0,
}: {
  balanceMinor: string;
  amountMinor: number;
  valid: boolean;
  adjustmentMinor?: number;
}) {
  const money = (value: number) =>
    (value / 100).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  const balance = Number(balanceMinor);
  const remaining =
    valid &&
    Number.isSafeInteger(amountMinor) &&
    amountMinor > 0 &&
    amountMinor <= balance + adjustmentMinor
      ? balance + adjustmentMinor - amountMinor
      : null;
  return (
    <dl
      aria-live="polite"
      className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs"
    >
      <div className="flex justify-between gap-2 text-slate-500">
        <dt>Saldo actual</dt>
        <dd className="whitespace-nowrap">{money(balance)}</dd>
      </div>
      {valid && adjustmentMinor !== 0 && (
        <div className="flex justify-between gap-2 text-teal-700">
          <dt>Ajuste al confirmar</dt>
          <dd>
            {adjustmentMinor > 0 ? "+" : ""}
            {money(adjustmentMinor)}
          </dd>
        </div>
      )}
      <div className="flex justify-between gap-2 font-semibold text-slate-800">
        <dt>Queda pendiente</dt>
        <dd className="whitespace-nowrap">
          {remaining === null ? "—" : money(remaining)}
        </dd>
      </div>
    </dl>
  );
}
