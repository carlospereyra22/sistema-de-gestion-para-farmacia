import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { requeueSaleInvoice, saleInvoice, type FiscalTrial } from "./lib/api";
import { trialTicket } from "./lib/fiscal-trial-ticket";
import { printTicketFrame } from "./lib/browser-ticket-print";
import { SaleCreditNotes } from "./sale-credit-notes";

const INVOICE_REFRESH_MS = 20_000;

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
  const [confirmRequeue, setConfirmRequeue] = useState(false);
  const pending = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
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
  // Mientras la factura espera, la cola fiscal la envía sola: se vuelve a
  // consultar (sólo lectura, nunca envía) para mostrar el resultado.
  const waiting =
    trial?.status === "QUEUED" ||
    trial?.status === "PENDING" ||
    trial?.status === "UNCERTAIN";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (pending.current) return;
      void saleInvoice(token, organizationId, branchId, saleId)
        .then((value) => {
          if (!pending.current) setTrial(value);
        })
        .catch(() => {});
    }, INVOICE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [waiting, token, organizationId, branchId, saleId]);
  async function refresh(process: boolean | "requeue") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setConfirmRequeue(false);
    try {
      setTrial(
        process === "requeue"
          ? await requeueSaleInvoice(token, organizationId, branchId, saleId)
          : await saleInvoice(token, organizationId, branchId, saleId, process),
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
    // <dialog> modal propio: el navegador lo apila arriba del detalle de venta
    // (otro <dialog> modal) y al cerrarlo se vuelve a ese detalle.
    <dialog
      ref={dialog}
      aria-labelledby="sale-invoice-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[95vh] w-[calc(100%-2rem)] max-w-md overflow-visible rounded-2xl border-0 bg-transparent p-0 backdrop:bg-slate-950/40"
    >
      <section className="max-h-[95vh] w-full overflow-auto rounded-2xl bg-white p-5 shadow-xl">
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
            {waiting &&
              " Se envía sola cuando ARCA responde; esta ventana se actualiza sola."}
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
        {trial?.status === "REJECTED" &&
          (confirmRequeue ? (
            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
              <p>
                Se pide un número nuevo a ARCA para esta misma venta. No se
                registra otra venta ni otro cobro.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh("requeue")}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50"
                >
                  Sí, volver a emitir
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRequeue(false)}
                  className="rounded-lg border px-4 py-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmRequeue(true)}
              className="mt-3 ml-2 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50"
            >
              Volver a emitir factura
            </button>
          ))}
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
    </dialog>,
    document.body,
  );
}
