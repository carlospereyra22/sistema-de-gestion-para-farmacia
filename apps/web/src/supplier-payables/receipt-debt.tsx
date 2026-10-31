import { CheckCircle2, WalletCards, ChevronDown } from "lucide-react";
import { field } from "./dialog";
import { ars, inputMinor, dateLabel } from "./api";
import type { ReceiptDebtDraft } from "./receipt-debt-rules";
export function ReceiptDebtFields({
  value,
  estimated,
  pendingEstimate,
  registered,
  onChange,
}: {
  value: ReceiptDebtDraft;
  estimated: string;
  pendingEstimate?: string;
  registered?: boolean;
  onChange: (value: ReceiptDebtDraft) => void;
}) {
  if (registered)
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <CheckCircle2 size={15} className="text-teal-600" />
        Deuda ya registrada · Esta recepción no generará otra.
      </p>
    );
  let amount: string | undefined;
  const provisional = pendingEstimate !== undefined;
  const suggested = pendingEstimate ?? estimated;
  try {
    amount = ars(inputMinor(value.amount ?? suggested));
  } catch {
    /* Esperar cantidades válidas. */
  }
  return (
    <section className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            className="accent-teal-600"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
          <WalletCards size={15} className="text-teal-600" />
          Registrar deuda de esta entrega
        </label>
        {value.enabled && (
          <span className="text-xs text-slate-500">
            {amount ? (
              <>
                <strong className="text-teal-700">{amount}</strong>
                {provisional && value.amount === undefined
                  ? " estimados"
                  : ""}{" "}
                ·{" "}
                {value.dueOn
                  ? `Vence ${dateLabel(value.dueOn)}`
                  : "Sin vencimiento"}
              </>
            ) : (
              "Se calcula al indicar las cantidades recibidas"
            )}
          </span>
        )}
      </div>
      {value.enabled && (
        <details className="mt-2 text-xs">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-teal-700">
            <ChevronDown size={13} />
            Ajustar importe o vencimiento
          </summary>
          <div className="mt-2 grid max-w-xl gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <label className="text-slate-500">
              Importe a pagar (ARS)
              <input
                className={`${field} mt-1`}
                inputMode="decimal"
                placeholder="Según cantidades recibidas"
                value={value.amount ?? suggested}
                onChange={(e) => onChange({ ...value, amount: e.target.value })}
              />
            </label>
            <label className="text-slate-500">
              Vencimiento (opcional)
              <input
                className={`${field} mt-1`}
                type="date"
                value={value.dueOn}
                onChange={(e) => onChange({ ...value, dueOn: e.target.value })}
              />
            </label>
            <p className="text-[11px] text-slate-400 sm:col-span-2">
              {provisional &&
                value.amount === undefined &&
                "Estimado de lo pendiente. Se recalcula al indicar las cantidades recibidas. "}
              No mueve Caja. Desmarcá si ya está pagada o la deuda ya fue
              registrada.
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
