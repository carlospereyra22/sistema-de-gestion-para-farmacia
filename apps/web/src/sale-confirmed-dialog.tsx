import { useEffect, useRef, useState } from "react";
import type { ThermalTicket } from "@gestion/contracts";
import {
  ArrowLeftRight,
  Banknote,
  Check,
  Coins,
  CreditCard,
  Eye,
  FileText,
  History,
  Plus,
  Printer,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
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
  "border border-marca-619 bg-white text-marca-535 hover:bg-teal-50";

const METHOD_LABELS: Record<SalesPaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  ACCOUNT: "Cuenta corriente",
};
const METHOD_ICONS: Record<SalesPaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  TRANSFER: ArrowLeftRight,
  ACCOUNT: UserRound,
};
const FORMAT_LABELS: Record<PrintFormat, string> = {
  TICKET: "ticket",
  A4: "A4",
};
// Hoja A4 (794 × 1123 px) dentro de la columna de vista previa.
// Ancho útil de la columna de vista previa (360 px menos márgenes) sobre el
// ancho de una hoja A4 a 96 dpi.
const A4_SCALE = 336 / 794;

export function SaleConfirmedDialog({
  saleId,
  totalMinor,
  savingsMinor = 0,
  customerName,
  payments,
  template,
  loadTicket,
  onPrint,
  onViewSale,
  onNewSale,
  aviso,
  storeName,
  documentType,
}: {
  /** Nombre de la farmacia en el encabezado. */
  storeName?: string;
  documentType?: "INTERNAL" | "INVOICE";
  /** Aclaración bajo los datos (venta sin conexión con factura pendiente). */
  aviso?: string;
  saleId: string;
  totalMinor: number;
  /** "Usted ahorró": ofertas y descuentos (SISTEMA-103). */
  savingsMinor?: number;
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
  const methods = [...new Set(payments.map((payment) => payment.method))];
  const methodNames = methods.map((method) => METHOD_LABELS[method]);
  const MethodIcon = methods.length === 1 ? METHOD_ICONS[methods[0]] : Wallet;
  const code = saleId.slice(0, 8).toUpperCase();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo/35 p-4 backdrop-blur-sm">
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
        className={`sale-confirmed-dialog relative grid max-h-full w-full overflow-y-auto overflow-x-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 ${previewOpen ? "max-w-[920px] sm:grid-cols-[minmax(0,1fr)_360px]" : "max-w-[560px]"}`}
      >
        {/* Adorno de la esquina: con la vista previa abierta esa esquina es
            la del ticket y lo tapaba (SISTEMA-104). */}
        {!previewOpen && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-gradient-to-br from-emerald-50 to-teal-50"
          />
        )}
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onNewSale}
          className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-slate-800"
        >
          <X size={18} />
        </button>
        <div className="relative flex min-w-0 flex-col p-6">
          {storeName ? (
            <p className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
              <span className="grid size-8 place-items-center rounded-lg bg-teal-700 text-white">
                <Plus size={18} strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="truncate pr-12">{storeName}</span>
            </p>
          ) : null}
          <div className="flex flex-col items-center text-center">
            <span className="grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50">
              <Check size={32} strokeWidth={2.75} />
            </span>
            <h2
              id="sale-confirmed-title"
              className="mt-4 text-[28px] font-bold leading-9 tracking-tight text-slate-900"
            >
              Venta confirmada
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              La venta se registró correctamente.
            </p>
            <div className="mt-5 inline-flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-emerald-50 px-6 py-3">
              <span className="flex items-center gap-2.5">
                <Coins
                  size={24}
                  aria-hidden="true"
                  className="text-emerald-700"
                />
                <span className="text-3xl font-bold tracking-tight tabular-nums text-teal-800">
                  {money(totalMinor)}
                </span>
              </span>
              <span className="flex items-center gap-2 border-slate-300 text-sm font-semibold text-teal-800 sm:border-l sm:pl-4">
                <MethodIcon
                  size={20}
                  aria-hidden="true"
                  className="text-emerald-700"
                />
                {methodNames.join(" + ")}
              </span>
            </div>
            {savingsMinor > 0 && (
              <p className="mt-2 text-sm font-semibold text-rose-700">
                El cliente ahorró {money(savingsMinor)}
              </p>
            )}
          </div>
          <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 px-5 py-3.5 text-sm sm:grid-cols-2 sm:gap-0">
            <div className="flex min-w-0 items-center gap-3 sm:pr-4">
              <UserRound
                size={20}
                aria-hidden="true"
                className="shrink-0 text-slate-500"
              />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Cliente</dt>
                <dd className="truncate font-semibold text-slate-900">
                  {customerName}
                </dd>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3 sm:border-l sm:border-slate-200 sm:pl-4">
              <FileText
                size={20}
                aria-hidden="true"
                className="shrink-0 text-slate-500"
              />
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Comprobante</dt>
                <dd className="truncate font-semibold text-slate-900">
                  {documentType === "INVOICE" ? "Factura · Cód." : "Interno N°"}{" "}
                  <span className="font-mono">{code}</span>
                </dd>
              </div>
            </div>
          </dl>
          {aviso ? (
            <p
              role="status"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-900"
            >
              {aviso}
            </p>
          ) : null}
          {changeMinor > 0 ? (
            <div
              aria-live="polite"
              className="mt-3 flex flex-wrap items-center justify-between gap-x-4 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sky-950"
            >
              <div>
                <p className="text-sm font-semibold">Vuelto a entregar</p>
                <p className="text-xs text-sky-800">
                  Recibido {money(cashMinor)} en efectivo
                </p>
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums text-sky-700">
                {money(changeMinor)}
              </p>
            </div>
          ) : null}
          {/* Orden del mostrador: Enter imprime en el formato predeterminado y el
              siguiente Enter abre una venta nueva. */}
          <div className="mt-auto grid gap-2.5 pt-5">
            <button
              ref={printButton}
              type="button"
              onClick={() => print(format)}
              className={`inline-flex min-h-14 items-center justify-center gap-2.5 rounded-xl text-lg font-semibold ${printed ? secondary : primary}`}
            >
              <Printer size={22} />
              {printed ? "Reimprimir" : "Imprimir"} {FORMAT_LABELS[format]}
              {!printed && (
                <kbd className="rounded-md border border-white/50 px-1.5 text-xs font-medium">
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
            <div className="grid grid-cols-3 gap-2.5">
              <button
                ref={newSaleButton}
                type="button"
                onClick={onNewSale}
                className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ${printed ? primary : secondary}`}
              >
                <Plus size={18} aria-hidden="true" />
                Nueva venta
                <kbd
                  className={`rounded-md border px-1 text-[10px] font-medium ${printed ? "border-white/50" : "border-teal-200 bg-teal-50"}`}
                >
                  {printed ? "Enter" : "Esc"}
                </kbd>
              </button>
              <button
                type="button"
                aria-pressed={previewOpen}
                onClick={() => setPreviewOpen((current) => !current)}
                className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-medium ${previewOpen ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                <Eye size={16} /> {previewOpen ? "Ocultar" : "Vista previa"}
              </button>
              <button
                type="button"
                onClick={onViewSale}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
            {/* Ocupa todo el alto del panel (SISTEMA-104). Con alto base 0 la
                hoja A4, que mide 1123 px antes de escalarse, no estira el
                popup: solo toma lo que sobra. */}
            <div className="m-3 mt-2 min-h-[360px] flex-1 overflow-hidden rounded-lg bg-white shadow-inner sm:h-0">
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
