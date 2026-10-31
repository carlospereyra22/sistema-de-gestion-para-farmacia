import { Banknote, CreditCard, ArrowLeftRight } from "lucide-react";
import {
  mixedReceiptPayments,
  type MixedDraft,
} from "./lib/account-mixed-payment";
const money = (minor: number) =>
  (minor / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
export function AccountMixedPayment({
  total,
  value,
  onChange,
}: {
  total: number;
  value: MixedDraft;
  onChange: (value: MixedDraft) => void;
}) {
  const parts = mixedReceiptPayments(value);
  const sum = parts?.reduce((acc, part) => acc + part.amountMinor, 0) ?? 0;
  const remaining = total - sum;
  return (
    <div className="space-y-1.5">
      {(
        [
          { method: "CASH", label: "Efectivo", icon: Banknote },
          { method: "CARD", label: "Tarjeta", icon: CreditCard },
          { method: "TRANSFER", label: "Transferencia", icon: ArrowLeftRight },
        ] as const
      ).map(({ method, label, icon: Icon }) => (
        <div key={method} className="flex items-center gap-2 text-[11px]">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Icon size={14} className="shrink-0 text-teal-700" />
            <span className="w-20 shrink-0">{label}</span>
            <input
              aria-label={`Importe en ${label.toLowerCase()}`}
              inputMode="decimal"
              value={value[method]}
              onChange={(event) =>
                onChange({ ...value, [method]: event.target.value })
              }
              placeholder="0,00"
              className="h-8 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2 text-right tabular-nums"
            />
          </label>
          <button
            type="button"
            title={`Completar el resto con ${label.toLowerCase()}`}
            disabled={parts === null || remaining <= 0}
            onClick={() =>
              onChange({
                ...value,
                [method]: (
                  ((parts?.find((part) => part.method === method)
                    ?.amountMinor ?? 0) +
                    remaining) /
                  100
                )
                  .toFixed(2)
                  .replace(".", ","),
              })
            }
            className="rounded-md px-1 py-1 text-teal-700 hover:bg-teal-50 disabled:opacity-30"
          >
            Resto
          </button>
        </div>
      ))}
      <p
        role="status"
        className={
          parts !== null && remaining === 0
            ? "sr-only"
            : `text-right text-[11px] leading-4 ${parts === null || remaining < 0 ? "text-rose-700" : "text-slate-500"}`
        }
      >
        {parts === null
          ? "Revisá los importes ingresados."
          : remaining < 0
            ? `Excede el total por ${money(-remaining)}`
            : remaining === 0
              ? total > 0
                ? "Importe completo"
                : "Seleccioná los artículos a cobrar."
              : `Falta completar ${money(Math.max(0, remaining))}`}
      </p>
    </div>
  );
}
