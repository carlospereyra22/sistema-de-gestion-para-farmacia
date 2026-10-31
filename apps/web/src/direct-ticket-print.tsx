import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ThermalTicket } from "@gestion/contracts";
import { Printer, X } from "lucide-react";
import { directTicketPrint } from "./lib/direct-ticket-print";
import { ThermalAgentUnavailable } from "./lib/thermal-agent";
import { ThermalSetupInstructions } from "./thermal-setup-instructions";

export function DirectTicketPrint({
  load,
  onClose,
}: {
  load: () => Promise<ThermalTicket>;
  onClose: () => void;
}) {
  const loading = useRef<Promise<ThermalTicket> | null>(null);
  const operation = useRef<Promise<void> | null>(null);
  const notice = useRef<HTMLElement>(null);
  const [ticket, setTicket] = useState<ThermalTicket>();
  const [busy, setBusy] = useState(true);
  const [sent, setSent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState("Conectando con la impresora…");
  const [confirmCopy, setConfirmCopy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    loading.current ??= load();
    operation.current ??= loading.current.then((value) =>
      directTicketPrint(value),
    );
    void loading.current
      .then((value) => {
        if (active) setTicket(value);
      })
      .catch(() => {});
    void operation.current
      .then(() => {
        if (active) {
          setSent(true);
          setMessage("Ticket enviado a la cola de Windows.");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setUnavailable(cause instanceof ThermalAgentUnavailable);
          setMessage(
            cause instanceof Error ? cause.message : "No se pudo imprimir.",
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [sent, onClose]);
  useLayoutEffect(() => {
    notice.current?.showPopover();
  });
  const retry = async (copy: boolean) => {
    if (pending.current || busy) return;
    pending.current = true;
    setBusy(true);
    setConfirmCopy(false);
    try {
      const value = ticket ?? (await load());
      setTicket(value);
      await directTicketPrint(value, copy ? "copy" : "retry");
      setUnavailable(false);
      setSent(true);
      setMessage("Ticket enviado a la cola de Windows.");
    } catch (cause) {
      setUnavailable(cause instanceof ThermalAgentUnavailable);
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo imprimir.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const content = (
    <aside
      ref={notice}
      popover="manual"
      role="status"
      className="fixed bottom-5 right-5 left-auto top-auto m-0 z-[100] w-[min(440px,calc(100vw-40px))] rounded-xl border border-teal-200 bg-white p-4 text-sm shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Printer size={21} className="shrink-0 text-teal-700" />
        <div className="flex-1">
          <p className="font-semibold">
            {busy
              ? "Preparando impresión…"
              : sent
                ? "Enviado"
                : unavailable
                  ? "Conectar impresora térmica"
                  : "Revisar impresión"}
          </p>
          <p className="mt-1 text-slate-600">{message}</p>
        </div>
        <button
          disabled={busy}
          aria-label="Cerrar aviso de impresión"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {!busy && !sent && (
        <div className="mt-4 space-y-3">
          {unavailable && <ThermalSetupInstructions />}
          {confirmCopy ? (
            <>
              <p className="rounded-lg bg-amber-50 p-3">
                ¿Verificaste el papel y necesitás otra copia? El envío anterior
                podría haber salido.
              </p>
              <button
                className="font-semibold text-teal-700"
                onClick={() => void retry(true)}
              >
                Sí, imprimir otra copia
              </button>
              <button className="ml-4" onClick={() => setConfirmCopy(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-lg border border-teal-200 px-3 py-2 text-teal-700"
                onClick={() => void retry(false)}
              >
                {unavailable
                  ? "Comprobar e imprimir"
                  : "Reintentar el mismo envío"}
              </button>
              {!unavailable && (
                <button
                  disabled={!ticket}
                  className="ml-3 text-teal-700"
                  onClick={() => setConfirmCopy(true)}
                >
                  Otra copia
                </button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
  return typeof document === "undefined"
    ? content
    : createPortal(
        content,
        document.querySelector("dialog[open]") ?? document.body,
      );
}
