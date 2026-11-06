import { useEffect, useId, useRef } from "react";
import { WalletCards, X } from "lucide-react";
import { primary, secondary } from "./dialog";

export function PaymentConfirm({
  supplierName,
  amount,
  method,
  date,
  outcome,
  busy,
  onBack,
  onConfirm,
}: {
  supplierName: string;
  amount: string;
  method: string;
  date: string;
  outcome: string;
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
          aria-label="Volver al pago"
          disabled={busy}
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </header>
      <h2 id={titleId} className="mt-4 text-lg font-semibold">
        ¿Seguro que querés registrar este pago?
      </h2>
      <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Proveedor</dt>
          <dd className="min-w-0 break-words text-right font-medium">
            {supplierName}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Importe</dt>
          <dd className="text-lg font-semibold text-teal-800">{amount}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Medio de pago</dt>
          <dd className="font-medium">{method}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Fecha</dt>
          <dd className="font-medium">{date}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">
        {outcome} No envía dinero ni modifica Caja.
      </p>
      <footer className="mt-5 flex justify-end gap-2">
        <button
          ref={back}
          type="button"
          className={secondary}
          disabled={busy}
          onClick={onBack}
        >
          Volver
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Registrando…" : "Sí, registrar pago"}
        </button>
      </footer>
    </section>
  );
}
