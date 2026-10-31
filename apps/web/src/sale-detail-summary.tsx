import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  Wallet,
  ReceiptText,
} from "lucide-react";
import type { Sale } from "./lib/api";

const paymentLabels = {
  CASH: { label: "Efectivo", icon: Banknote },
  CARD: { label: "Tarjeta", icon: CreditCard },
  TRANSFER: { label: "Transferencia", icon: ArrowLeftRight },
  ACCOUNT: { label: "Cuenta corriente", icon: Wallet },
  OTHER: { label: "Otro", icon: Wallet },
};

export function SalePaymentSummary({
  payments,
}: {
  payments: Sale["payments"];
}) {
  const methods = [...new Set(payments.map((payment) => payment.method))];
  return (
    <section
      aria-label="Medios de pago de la venta"
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="flex items-center gap-2 text-slate-500">
        <Wallet size={16} aria-hidden="true" />
        <h4 className="text-xs font-semibold uppercase tracking-wide">
          Medio{methods.length > 1 ? "s" : ""} de pago
        </h4>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {methods.map((method) => {
          const { label, icon: Icon } = paymentLabels[method];
          return (
            <span
              key={method}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
            >
              <Icon size={17} aria-hidden="true" className="text-teal-700" />
              {label}
            </span>
          );
        })}
        {!methods.length && (
          <p className="text-sm text-slate-500">Sin cobro registrado</p>
        )}
      </div>
    </section>
  );
}

export function SaleDetailTotal({
  total,
  status,
  documentType,
}: {
  total: string;
  status: Sale["status"];
  documentType: Sale["documentType"];
}) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-teal-800">
          <ReceiptText size={15} aria-hidden="true" />
          {documentType === "INVOICE" ? "Factura" : "Ticket"}
        </span>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
        >
          {status === "COMPLETED" ? "Confirmada" : "Anulada"}
        </span>
      </div>
      <p className="mt-4 text-xs font-medium text-teal-800">
        Total de la venta
      </p>
      <p className="mt-1 break-words text-2xl font-bold tracking-tight text-teal-900 tabular-nums">
        {total}
      </p>
    </div>
  );
}
