import { FileCheck2, ReceiptText, SlidersHorizontal } from "lucide-react";

export function SaleDocumentChoice({
  value,
  onChange,
  disabled,
  onConfigure,
  summary,
  environment = "HOMOLOGATION",
  invoiceDisabled = false,
  unavailableReason,
  sinCaja = false,
}: {
  value: "INTERNAL" | "INVOICE";
  onChange: (value: "INTERNAL" | "INVOICE") => void;
  disabled: boolean;
  onConfigure?: () => void;
  summary?: string;
  environment?: "HOMOLOGATION" | "PRODUCTION";
  invoiceDisabled?: boolean;
  unavailableReason?: string;
  /** No hay caja abierta: la factura espera a que se incorpore el cobro. */
  sinCaja?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Tipo de comprobante</legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["INTERNAL", "Comprobante interno", ReceiptText],
            ["INVOICE", "Factura", FileCheck2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            disabled={disabled || (id === "INVOICE" && invoiceDisabled)}
            aria-pressed={value === id}
            title={
              id === "INVOICE"
                ? invoiceDisabled
                  ? unavailableReason ||
                    "Configurá la facturación para habilitarla."
                  : environment === "PRODUCTION"
                    ? "Factura real con autorización de ARCA"
                    : "Homologación sin validez fiscal; registra stock y cobros."
                : "No va a ARCA. Se puede enviar después desde el historial."
            }
            onClick={() => onChange(id)}
            className={`flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 ${id === "INVOICE" && invoiceDisabled ? "border-slate-200 text-slate-400" : value === id ? "border-teal-500 bg-teal-50 text-teal-900 ring-1 ring-teal-500" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40"}`}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
        {onConfigure && (
          <button
            type="button"
            onClick={onConfigure}
            disabled={disabled}
            aria-label="Configuración de facturación"
            aria-haspopup="dialog"
            title="Configurar receptor y tipo de factura"
            // A la derecha y con nombre: abre receptor y tipo de factura.
            className="ml-auto flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Datos de facturación
          </button>
        )}
      </div>
      {/* Avisos de la factura elegida. */}
      <div>
        {value === "INVOICE" &&
          !invoiceDisabled &&
          environment === "HOMOLOGATION" && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Homologación · Sin validez fiscal
            </p>
          )}
        {value === "INVOICE" && !invoiceDisabled && sinCaja && (
          <p className="mt-1.5 text-[11px] text-amber-700">
            Sin caja abierta: la factura se emite al incorporar el cobro a una
            caja.
          </p>
        )}
        {value === "INVOICE" && !invoiceDisabled && summary && (
          <p
            className="mt-1.5 truncate text-[11px] text-slate-500"
            title={summary}
          >
            {summary}
          </p>
        )}
      </div>
    </fieldset>
  );
}
