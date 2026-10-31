import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saleInvoice, type FiscalTrial } from "./lib/api";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import { printTicketFrame } from "./lib/browser-ticket-print";
import { SaleCreditNotes } from "./sale-credit-notes";

export function SaleInvoiceDialog({
  token,
  organizationId,
  branchId,
  saleId,
  onClose,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  saleId: string;
  onClose: () => void;
}) {
  const [trial, setTrial] = useState<FiscalTrial>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const pending = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let active = true;
    void saleInvoice(token, organizationId, branchId, saleId)
      .then((value) => {
        if (active) setTrial(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "No se pudo consultar.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, organizationId, branchId, saleId]);
  async function refresh(process: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      setTrial(
        await saleInvoice(token, organizationId, branchId, saleId, process),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo consultar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-invoice-title"
        className="max-h-[95vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="sale-invoice-title" className="text-lg font-semibold">
            Factura
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-2"
          >
            Cerrar
          </button>
        </div>
        {trial?.status === "AUTHORIZED" ? (
          <p className="mt-2 text-xs text-amber-800">
            {trial.environment === "PRODUCTION"
              ? "Autorizada por ARCA · Producción"
              : "Homologación · Sin validez fiscal"}
          </p>
        ) : (
          <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Venta registrada. La factura está pendiente; no repitas la venta.
          </p>
        )}
        {!trial && !error && <p role="status">Consultando comprobante…</p>}
        {error && (
          <p role="alert" className="my-3 text-red-700">
            {error}
          </p>
        )}
        {trial && trial.status !== "AUTHORIZED" && (
          <>
            <p className="font-semibold">
              {
                {
                  QUEUED: "Pendiente de envío",
                  PENDING: "Esperando confirmación de ARCA",
                  UNCERTAIN: "Resultado por confirmar",
                  REJECTED: "Rechazada: la venta local permanece registrada",
                }[trial.status]
              }
            </p>
            <p className="my-3 text-sm">{trial.detail}</p>
          </>
        )}
        {trial?.status === "AUTHORIZED" ? (
          <>
            <button
              type="button"
              className="my-3 rounded-lg bg-teal-700 px-4 py-2 text-white"
              onClick={() => {
                if (frame.current)
                  void printTicketFrame(frame.current).catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "No se pudo imprimir.",
                    ),
                  );
              }}
            >
              Imprimir · 80 mm
            </button>
            <iframe
              ref={frame}
              title="Factura de la venta"
              srcDoc={trialTicket(trial)}
              className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void refresh(Boolean(trial && trial.status !== "REJECTED"))
            }
            className="mt-3 rounded-lg border border-teal-700 px-4 py-2 text-teal-800 disabled:opacity-50"
          >
            {busy
              ? "Consultando…"
              : trial?.status === "QUEUED"
                ? "Enviar factura pendiente"
                : "Consultar resultado"}
          </button>
        )}
        {trial?.environment === "PRODUCTION" &&
          trial.status === "AUTHORIZED" && (
            <>
              <button
                type="button"
                className="mt-4 text-sm text-teal-700 underline"
                onClick={() => setShowCredits(!showCredits)}
              >
                {showCredits
                  ? "Cerrar notas de crédito"
                  : "Devolución total / parcial · Notas de crédito"}
              </button>
              {showCredits && (
                <SaleCreditNotes
                  token={token}
                  organizationId={organizationId}
                  branchId={branchId}
                  saleId={saleId}
                />
              )}
            </>
          )}
      </section>
    </div>,
    document.body,
  );
}
