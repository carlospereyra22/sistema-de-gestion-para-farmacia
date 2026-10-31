import { useEffect, useRef, useState } from "react";
import type { ThermalTicket } from "@gestion/contracts";
import { Printer, X } from "lucide-react";
import { thermalTicketHtml } from "./lib/thermal-ticket";
import { printTicketFrame } from "./lib/browser-ticket-print";

export function ThermalTicketDialog({
  load,
  onClose,
}: {
  load: () => Promise<ThermalTicket>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ticket, setTicket] = useState<ThermalTicket>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    dialog.current?.showModal();
    void load()
      .then((value) => {
        if (active) {
          setReady(false);
          setTicket(value);
        }
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el comprobante.",
          );
      });
    return () => {
      active = false;
    };
  }, [load]);
  const print = async () => {
    if (!frame.current || !ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await printTicketFrame(frame.current);
      setMessage(
        "Se abrió el diálogo de impresión. El navegador no informa si imprimiste o cancelaste.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo abrir la impresión.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto h-[90dvh] w-[min(95vw,540px)] max-w-none rounded-2xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-teal-50/60 p-4">
          <div>
            <h2 className="font-semibold">Vista previa del comprobante</h2>
            <p className="text-xs text-slate-500">
              Térmico 80 mm · Impresión desde Gestión
            </p>
          </div>
          <button aria-label="Cerrar" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {ticket ? (
          <iframe
            ref={frame}
            title="Ticket"
            sandbox="allow-same-origin allow-modals"
            onLoad={() => setReady(true)}
            srcDoc={thermalTicketHtml(ticket, window.location.origin)}
            className="min-h-0 w-full flex-1 border-0"
          />
        ) : (
          <p className="flex-1 p-6">Cargando comprobante…</p>
        )}
        <footer className="shrink-0 space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">
            Elegí la impresora de 80 mm, escala 100 %, sin márgenes ni
            encabezados del navegador. No necesitás abrir ningún agente.
          </p>
          {message && (
            <p role="status" className="text-sm text-slate-700">
              {message}
            </p>
          )}
          <button
            disabled={!ticket || !ready || busy}
            onClick={() => void print()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Printer size={17} />
            {busy
              ? "Abriendo impresión…"
              : ticket?.kind === "account"
                ? "Imprimir comprobante"
                : "Imprimir remito"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
