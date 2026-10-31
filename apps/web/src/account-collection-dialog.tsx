import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function AccountCollectionDialog({
  children,
  busy,
  saleId,
  customerName,
  error,
  onClose,
}: {
  children: ReactNode;
  busy: boolean;
  saleId: string;
  customerName: string;
  error: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="sale-collection-title"
      className="account-sale-collection-dialog m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/35"
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 id="sale-collection-title" className="text-base font-semibold">
            Cobrar venta {saleId.slice(0, 8).toUpperCase()}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {customerName} · Revisá el importe y el medio de pago.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Cerrar resumen de cobro"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 disabled:opacity-40"
        >
          <X size={18} />
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {children}
    </dialog>,
    document.body,
  );
}
