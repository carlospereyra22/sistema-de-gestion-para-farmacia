import { useEffect, useId, useRef } from "react";
import { CircleAlert, ShieldCheck, X } from "lucide-react";

export function ProductSaveErrorDialog({
  message,
  onClose,
  title = "No pudimos guardar el producto",
}: {
  message: string;
  onClose: () => void;
  title?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
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
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <CircleAlert size={26} aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar aviso"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-teal-700"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <h2 id={titleId} className="mt-5 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p
          id={messageId}
          className="mt-3 break-words rounded-xl border border-amber-100 bg-amber-50/60 p-4 text-sm leading-6 text-slate-700"
        >
          {message}
        </p>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-teal-700"
            aria-hidden="true"
          />
          Lo que completaste sigue en el formulario. Podés revisarlo sin empezar
          de nuevo.
        </p>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[#31826a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#276c58] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          Volver al formulario
        </button>
      </div>
    </dialog>
  );
}
