import { useEffect, useId, useRef, type ReactNode } from "react";
import { CircleAlert, FilePenLine, Save, X } from "lucide-react";

export function PurchaseHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-500"
      >
        <CircleAlert size={14} aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="invisible absolute left-1/2 top-full z-50 w-[min(280px,70vw)] -translate-x-1/2 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="block rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-relaxed text-slate-600 shadow-lg">
          {children}
        </span>
      </span>
    </span>
  );
}

export function PurchaseExitDialog({
  documentName = "compra",
  locked,
  onContinue,
  onSave,
  onDiscard,
}: {
  documentName?: "compra" | "factura" | "deuda";
  locked: boolean;
  onContinue: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      requestAnimationFrame(() => {
        if (previous instanceof HTMLElement && previous.isConnected)
          previous.focus();
      });
    };
  }, []);
  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="p-1 text-slate-800"
    >
      <header className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <FilePenLine size={22} />
        </span>
        <button
          type="button"
          ref={ref}
          aria-label={`Volver a la ${documentName}`}
          onClick={onContinue}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>
      </header>
      <h2 id={titleId} className="mt-4 text-lg font-semibold">
        {locked ? "Conservá esta operación" : `¿Salir de la ${documentName}?`}
      </h2>
      <p
        id={descriptionId}
        className="mt-2 text-sm leading-relaxed text-slate-500"
      >
        {locked
          ? "La solicitud ya fue enviada. Guardá el borrador y reintentá la misma solicitud para conocer el resultado, sin duplicar la operación."
          : "Podés guardar el borrador para continuar después o seguir trabajando ahora. Si lo descartás, se perderán los datos sin guardar."}
      </p>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onSave}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800"
        >
          <Save size={16} /> Guardar borrador y salir
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Seguir trabajando
        </button>
      </div>
      {!locked && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-center">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            Descartar borrador
          </button>
        </div>
      )}
    </section>
  );
}
