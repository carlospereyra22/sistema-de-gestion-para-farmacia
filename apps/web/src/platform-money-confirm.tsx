import { useEffect, useId, useRef } from "react";
import { WalletCards, X } from "lucide-react";
import { primary, secondary } from "./supplier-payables/dialog";

/** Resumen antes de guardar algo que cambia lo que se cobra. */
export function PlatformMoneyConfirm({
  question,
  rows,
  busy,
  onBack,
  onConfirm,
}: {
  question: string;
  rows: readonly (readonly [string, string])[];
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => back.current?.focus(), []);
  return (
    <section aria-labelledby={titleId} className="p-1 text-slate-800">
      <header className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <WalletCards size={22} aria-hidden="true" />
        </span>
        <button
          type="button"
          aria-label="Volver"
          disabled={busy}
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </header>
      <h2 id={titleId} className="mt-4 text-lg font-semibold">
        {question}
      </h2>
      <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <button
          ref={back}
          type="button"
          disabled={busy}
          className={secondary}
          onClick={onBack}
        >
          Volver
        </button>
        <button
          type="button"
          disabled={busy}
          className={primary}
          onClick={onConfirm}
        >
          {busy ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </section>
  );
}
