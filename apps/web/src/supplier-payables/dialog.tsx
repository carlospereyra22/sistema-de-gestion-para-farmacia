import { useEffect, useId, useRef, type ReactNode } from "react";
import { FileText, X } from "lucide-react";
export const field =
  "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-50 disabled:bg-slate-50";
export const secondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50";
export const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50";
export function PayableDialog({
  title,
  onClose,
  children,
  confirmation,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  confirmation?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={confirmation ? undefined : titleId}
      aria-label={confirmation ? "Confirmar salida" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto ${confirmation ? "w-[min(440px,calc(100vw-2rem))]" : "w-[min(760px,calc(100vw-2rem))]"} max-h-[90dvh] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl backdrop:bg-slate-950/35`}
    >
      {confirmation}
      <div hidden={Boolean(confirmation)}>
        <header className="mb-5 flex items-center justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-2 font-semibold">
            <span className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <FileText size={20} />
            </span>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
