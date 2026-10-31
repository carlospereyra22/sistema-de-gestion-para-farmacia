import { useEffect, useId, useRef } from "react";

export function AccountAmountConfirmation({
  name,
  before,
  after,
  disabled,
  onConfirm,
  onCancel,
}: {
  name: string;
  before: number;
  after: number;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const money = (minor: number) =>
    (minor / 100).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  return (
    <dialog
      ref={dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-900/30"
    >
      <h3 id={id} className="text-base font-semibold text-slate-900">
        ¿Aplicar el nuevo saldo?
      </h3>
      <p className="mt-2 text-sm text-slate-600">{name}</p>
      <dl className="my-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
        <div className="flex justify-between gap-3 text-slate-500">
          <dt>Importe anterior</dt>
          <dd>{money(before)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold text-teal-700">
          <dt>Nuevo importe</dt>
          <dd>{money(after)}</dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-slate-500">
        Este será el nuevo saldo del artículo. Abonar ahora permite pagar todo o
        una parte. El ajuste se guardará junto con el pago al confirmar el
        cobro.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
        >
          Volver
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
        >
          Confirmar importe
        </button>
      </div>
    </dialog>
  );
}
