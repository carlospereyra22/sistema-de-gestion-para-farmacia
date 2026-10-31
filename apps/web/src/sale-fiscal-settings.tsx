import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ConsumerFiscalFields } from "./consumer-fiscal-fields";
import type {
  SaleFiscalCapabilities,
  SaleFiscalOptions,
} from "@gestion/contracts";

export function SaleFiscalSettings({
  value,
  capabilities,
  customerName,
  customerFiscalSummary,
  onSave,
  onClose,
}: {
  value: SaleFiscalOptions;
  capabilities: SaleFiscalCapabilities | null;
  customerName?: string;
  customerFiscalSummary?: string;
  onSave: (value: SaleFiscalOptions) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby={`${id}-title`}
      className="m-auto max-h-[90dvh] w-[min(460px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/35"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          Configuración de facturación
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar configuración"
          className="rounded-lg p-2 hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !capabilities?.voucherTypes.some(
              (type) => type.code === draft.voucherType,
            )
          )
            return;
          if (draft.recipient === "CUSTOMER" && !customerName) return;
          onSave(
            draft.recipient === "CUSTOMER"
              ? { recipient: "CUSTOMER", voucherType: draft.voucherType }
              : {
                  ...draft,
                  consumerName: draft.consumerName?.trim() || undefined,
                  consumerDocument: draft.consumerDocument || undefined,
                },
          );
        }}
      >
        {!capabilities && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            No se pudo consultar la configuración fiscal del servidor. Cerrá y
            volvé a abrir Ventas para reintentar. No se habilitan tipos de
            factura sin esa verificación.
          </p>
        )}
        <label className="mt-5 block text-sm" htmlFor={`${id}-recipient`}>
          Receptor
        </label>
        <select
          autoFocus
          id={`${id}-recipient`}
          className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm"
          value={draft.recipient}
          onChange={(event) =>
            setDraft({
              ...draft,
              recipient: event.target.value as SaleFiscalOptions["recipient"],
            })
          }
        >
          <option value="FINAL_CONSUMER">Consumidor final</option>
          <option value="CUSTOMER" disabled={!customerName}>
            Datos fiscales del cliente
            {customerName
              ? ` · ${customerName}`
              : " (seleccioná uno en Ventas)"}
          </option>
        </select>
        {draft.recipient === "CUSTOMER" ? (
          <p className="mt-2 text-xs text-slate-500">
            {customerFiscalSummary ||
              "El servidor validará los datos fiscales guardados del cliente."}
          </p>
        ) : (
          <ConsumerFiscalFields value={draft} onChange={setDraft} />
        )}
        <label className="mt-4 block text-sm" htmlFor={`${id}-voucher`}>
          Tipo de factura
        </label>
        <select
          id={`${id}-voucher`}
          value={draft.voucherType}
          onChange={(event) => {
            const selected = capabilities?.voucherTypes.find(
              (type) => String(type.code) === event.target.value,
            );
            if (selected) setDraft({ ...draft, voucherType: selected.code });
          }}
          disabled={!capabilities?.voucherTypes.length}
          className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm"
        >
          {capabilities?.voucherTypes.length ? (
            capabilities.voucherTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))
          ) : (
            <option value={11}>Sin tipos habilitados</option>
          )}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          {capabilities?.reason ||
            "Sólo se ofrecen los tipos compatibles con el emisor y el circuito implementado. No cambia la condición fiscal del comercio."}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Sólo para esta venta. No modifica el cliente, sus precios ni su cuenta
          corriente.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              !capabilities?.voucherTypes.length ||
              (draft.recipient === "CUSTOMER" && !customerName)
            }
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
