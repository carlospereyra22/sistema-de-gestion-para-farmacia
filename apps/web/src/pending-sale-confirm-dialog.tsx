import { useEffect, useId, useRef } from "react";
import { ShoppingCart, X } from "lucide-react";

export function PendingSaleConfirmDialog({
  action,
  currentBranch,
  nextBranch,
  onCancel,
  onConfirm,
}: {
  action: "branch" | "logout";
  currentBranch: string;
  nextBranch?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const changingBranch = action === "branch";
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-velo/40"
    >
      <div className="flex items-start gap-3 px-6 pt-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <ShoppingCart size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {changingBranch ? "¿Cambiar de sucursal?" : "¿Cerrar sesión?"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Hay una venta pendiente en <strong>{currentBranch}</strong>.
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onCancel}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p
        id={descriptionId}
        className="mx-6 mt-5 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-slate-700"
      >
        {changingBranch ? (
          <>
            Si vas a <strong>{nextBranch}</strong>, se descartarán los productos
            que agregaste a esa venta.
          </>
        ) : (
          "Si cerrás sesión, se descartarán los productos que agregaste a esa venta."
        )}
      </p>
      <footer className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Seguir con la venta
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
        >
          {changingBranch ? "Descartar y cambiar" : "Descartar y salir"}
        </button>
      </footer>
    </dialog>
  );
}
