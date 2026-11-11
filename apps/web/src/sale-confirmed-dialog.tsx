import { useEffect, useRef, useState } from "react";
import type { ThermalTicket } from "@gestion/contracts";
import { Check, Eye, History, Printer, X } from "lucide-react";
import { A4PreviewDialog } from "./a4-preview-dialog";
import { a4DocumentHtml, type A4Template } from "./lib/a4-document";
import type { PrintFormat } from "./lib/document-template-api";
import { thermalTicketHtml } from "./lib/thermal-ticket";
import type { SalesPaymentMethod } from "./lib/sales-shortcuts";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

const primary = "bg-teal-700 text-white shadow-sm hover:bg-teal-800";
const secondary =
  "border border-[#0f9b8e] bg-white text-[#087f70] hover:bg-teal-50";

const METHOD_LABELS: Record<SalesPaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  ACCOUNT: "Cuenta corriente",
};
const FORMAT_LABELS: Record<PrintFormat, string> = {
  TICKET: "ticket",
  A4: "A4",
};
// Hoja A4 (794 × 1123 px) dentro de la columna de vista previa.
const A4_SCALE = 316 / 794;

export function SaleConfirmedDialog({
  saleId,
  totalMinor,
  customerName,
  payments,
  template,
  loadTicket,
  onPrint,
  onViewSale,
  onNewSale,
  aviso,
}: {
  /** Aclaración bajo los datos (venta sin conexión con factura pendiente). */
  aviso?: string;
  saleId: string;
  totalMinor: number;
  customerName: string;
  payments: { method: SalesPaymentMethod; amountMinor: number }[];
  // Plantilla A4 y formato predeterminado de la organización; sin ella, ticket.
  template?: A4Template & { defaultFormat: PrintFormat };
  loadTicket: () => Promise<ThermalTicket>;
  onPrint: () => void;
  onViewSale: () => void;
  onNewSale: () => void;
}) {
  const printButton = useRef<HTMLButtonElement>(null);
  const newSaleButton = useRef<HTMLButtonElement>(null);
  const [printed, setPrinted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [a4Open, setA4Open] = useState(false);
  const [ticket, setTicket] = useState<ThermalTicket>();
  const [ticketError, setTicketError] = useState("");
  const format: PrintFormat = template?.defaultFormat ?? "TICKET";
  const other: PrintFormat = format === "A4" ? "TICKET" : "A4";
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const cashMinor = payments
    .filter((payment) => payment.method === "CASH")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  // Solo el efectivo puede superar el saldo, así que el excedente es vuelto.
  const changeMinor = Math.max(paid - totalMinor, 0);
  useEffect(() => {
    printButton.current?.focus();
  }, []);
  // El ticket se pide recién cuando hace falta: vista previa o impresión A4.
  const needsTicket = previewOpen || a4Open;
  useEffect(() => {
    if (!needsTicket || ticket) return;
    let active = true;
    void loadTicket()
      .then((value) => {
        if (active) setTicket(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setTicketError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el comprobante.",
          );
      });
    return () => {
      active = false;
    };
  }, [loadTicket, needsTicket, ticket]);
  const print = (target: PrintFormat) => {
    if (target === "A4" && template) setA4Open(true);
    else onPrint();
    setPrinted(true);
    newSaleButton.current?.focus();
  };
  const previewA4 = format === "A4" && template;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-confirmed-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onNewSale();
          }
        }}
        className={`sale-confirmed-dialog relative grid max-h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${previewOpen ? "max-w-[820px] sm:grid-cols-[minmax(0,1fr)_340px]" : "max-w-[480px]"}`}
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onNewSale}
          className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <X size={18} />
        </button>
        <div className="flex min-w-0 flex-col p-6">
          <span className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <Check size={26} strokeWidth={2.5} />
          </span>
          <h2
            id="sale-confirmed-title"
            className="mt-4 text-xl font-semibold text-slate-900"
          >
            Venta confirmada
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {money(totalMinor)} ·{" "}
            {[
              ...new Set(
                payments.map((payment) => METHOD_LABELS[payment.method]),
              ),
            ].join(" + ")}
          </p>
          <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Cliente</dt>
              <dd className="truncate font-medium text-slate-900">
                {customerName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Código interno</dt>
              <dd className="font-mono text-xs font-semibold text-slate-900">
                {saleId.slice(0, 8).toUpperCase()}
              </dd>
            </div>
          </dl>
          {aviso ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
            >
              {aviso}
            </p>
          ) : null}
          {changeMinor > 0 ? (
            <div
              aria-live="polite"
              className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-950"
            >
              <p className="text-sm font-semibold">Vuelto a entregar</p>
              <p className="text-4xl font-bold tracking-tight tabular-nums text-sky-700">
                {money(changeMinor)}
              </p>
              <p className="mt-1 text-xs text-sky-800">
                Recibido {money(cashMinor)} en efectivo
              </p>
            </div>
          ) : null}
          {/* Orden del mostrador: Enter imprime en el formato predeterminado y el
              siguiente Enter abre una venta nueva. */}
          <div className="mt-auto grid gap-2 pt-5">
            <button
              ref={printButton}
              type="button"
              onClick={() => print(format)}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold ${printed ? secondary : primary}`}
            >
              <Printer size={18} />
              {printed ? "Reimprimir" : "Imprimir"} {FORMAT_LABELS[format]}
              {!printed && (
                <kbd className="rounded border border-white/50 px-1.5 text-[11px] font-medium">
                  Enter
                </kbd>
              )}
            </button>
            {template && (
              <button
                type="button"
                onClick={() => print(other)}
                className="text-center text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
              >
                o imprimir en {FORMAT_LABELS[other]}
              </button>
            )}
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <button
                ref={newSaleButton}
                type="button"
                onClick={onNewSale}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ${printed ? primary : secondary}`}
              >
                Nueva venta
                <kbd
                  className={`rounded border px-1 text-[10px] font-medium ${printed ? "border-white/50" : "border-current"}`}
                >
                  {printed ? "Enter" : "Esc"}
                </kbd>
              </button>
              <button
                type="button"
                aria-pressed={previewOpen}
                onClick={() => setPreviewOpen((current) => !current)}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-medium ${previewOpen ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                <Eye size={16} /> {previewOpen ? "Ocultar" : "Vista previa"}
              </button>
              <button
                type="button"
                onClick={onViewSale}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <History size={16} /> Ver ventas
              </button>
            </div>
          </div>
        </div>
        {previewOpen && (
          <aside
            aria-label="Vista previa del comprobante"
            className="flex min-h-0 flex-col border-t border-slate-200 bg-slate-100 sm:border-l sm:border-t-0"
          >
            <p className="px-4 pt-3 text-xs font-semibold text-slate-600">
              {previewA4
                ? "Vista previa · Hoja A4"
                : "Vista previa del ticket · 80 mm"}
            </p>
            <div className="m-3 mt-2 min-h-[360px] flex-1 overflow-hidden rounded-lg bg-white shadow-inner sm:h-[480px] sm:flex-none">
              {ticket && previewA4 ? (
                <iframe
                  title="Vista previa del comprobante A4"
                  sandbox=""
                  srcDoc={a4DocumentHtml(ticket, template)}
                  style={{
                    width: 794,
                    height: 1123,
                    transform: `scale(${A4_SCALE})`,
                    transformOrigin: "top left",
                  }}
                  className="border-0"
                />
              ) : ticket ? (
                <iframe
                  title="Vista previa del ticket"
                  sandbox="allow-same-origin"
                  srcDoc={thermalTicketHtml(ticket, window.location.origin)}
                  className="h-full w-full border-0"
                />
              ) : (
                <p
                  role={ticketError ? "alert" : "status"}
                  className="grid h-full place-items-center px-4 text-center text-sm text-slate-500"
                >
                  {ticketError || "Cargando vista previa…"}
                </p>
              )}
            </div>
          </aside>
        )}
      </section>
      {a4Open && template && ticket && (
        <A4PreviewDialog
          title={`Comprobante ${ticket.number}`}
          html={a4DocumentHtml(ticket, template)}
          autoPrint
          onClose={() => {
            setA4Open(false);
            newSaleButton.current?.focus();
          }}
        />
      )}
      {a4Open && !ticket && ticketError && (
        <p
          role="alert"
          className="fixed bottom-5 right-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow"
        >
          {ticketError}
        </p>
      )}
    </div>
  );
}
