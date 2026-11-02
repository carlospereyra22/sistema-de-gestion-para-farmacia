import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { printA4Frame } from "./lib/a4-print";

// Hoja A4 en tamaño real, con impresión o "Guardar como PDF" del navegador.
export function A4PreviewDialog({
  title,
  html,
  autoPrint = false,
  onClose,
}: {
  title: string;
  html: string;
  // Desde Ventas: abre el diálogo de impresión apenas la hoja está lista.
  autoPrint?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const autoPrinted = useRef(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!autoPrint || !ready || autoPrinted.current) return;
    autoPrinted.current = true;
    void print();
  }, [autoPrint, ready]);
  const print = async () => {
    if (!frame.current) return;
    setMessage("");
    try {
      await printA4Frame(frame.current);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo abrir la impresión.",
      );
    }
  };
  const content = (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // El portal sigue el árbol de React: Esc no debe llegar a la ventana de atrás.
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      className="m-auto h-[95dvh] w-[min(96vw,900px)] max-w-none rounded-2xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/60 px-5 py-3">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-slate-500">
              Hoja A4 · En el diálogo elegí tu impresora o «Guardar como PDF».
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!ready}
              onClick={() => void print()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Printer size={16} /> Imprimir o guardar PDF
            </button>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-white"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        {message && (
          <p
            role="alert"
            className="bg-rose-50 px-5 py-2 text-sm text-rose-800"
          >
            {message}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-4">
          {/* Sin scripts: sólo mismo origen (para imprimir) y diálogos del navegador. */}
          <iframe
            ref={frame}
            title={title}
            sandbox="allow-same-origin allow-modals"
            srcDoc={html}
            onLoad={() => setReady(true)}
            className="mx-auto block h-[1123px] w-[794px] max-w-full border-0 bg-white shadow"
          />
        </div>
      </div>
    </dialog>
  );
  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
