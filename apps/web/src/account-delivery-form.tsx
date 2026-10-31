import { useEffect, useId, useRef, useState } from "react";
import { HandCoins, X } from "lucide-react";
import type { AccountItems } from "./lib/api";
import { prepareAccountDelivery } from "./lib/account-delivery";

export function AccountDeliveryForm({
  data,
  replacesSelection,
  onPrepared,
  onCancel,
}: {
  data: AccountItems;
  replacesSelection: boolean;
  onPrepared: (chosen: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    input.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const prepare = () => {
    try {
      onPrepared(prepareAccountDelivery(data, amount).chosen);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo preparar la entrega.",
      );
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/30"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 text-sm font-semibold text-slate-800"
        >
          <HandCoins size={18} className="text-teal-700" />
          Cobro parcial
        </h2>
        <button
          type="button"
          aria-label="Cerrar cobro parcial"
          onClick={onCancel}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </div>
      <label htmlFor={id} className="text-xs font-semibold text-slate-700">
        Importe recibido
      </label>
      <div className="mt-2">
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500"
          >
            $
          </span>
          <input
            ref={input}
            id={id}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError("");
            }}
            inputMode="decimal"
            autoComplete="off"
            maxLength={30}
            placeholder="Ej. 180.000"
            aria-describedby={`${id}-hint`}
            aria-invalid={!!error}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                prepare();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-lg font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <p
          id={`${id}-hint`}
          className="mt-2 text-[11px] leading-5 text-slate-500"
        >
          Se prepara el pago; todavía no se cobra.
          {replacesSelection ? " Reemplaza la selección actual." : ""}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-row-reverse gap-2">
          <button
            type="button"
            onClick={prepare}
            className="h-10 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
          >
            Continuar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg px-2 text-xs text-slate-500 hover:bg-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </dialog>
  );
}
