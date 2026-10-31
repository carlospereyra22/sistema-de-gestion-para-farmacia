import { FileCheck2, ReceiptText, Ellipsis } from "lucide-react";

export function SaleDocumentChoice({
  value,
  onChange,
  disabled,
  onConfigure,
  summary,
  environment = "HOMOLOGATION",
  invoiceDisabled = false,
  unavailableReason,
}: {
  value: "INTERNAL" | "INVOICE";
  onChange: (value: "INTERNAL" | "INVOICE") => void;
  disabled: boolean;
  onConfigure?: () => void;
  summary?: string;
  environment?: "HOMOLOGATION" | "PRODUCTION";
  invoiceDisabled?: boolean;
  unavailableReason?: string;
}) {
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">Tipo de comprobante</legend>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            ["INTERNAL", "Ticket", ReceiptText],
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
                : "Comprobante interno"
            }
            onClick={() => onChange(id)}
            className={`flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 ${id === "INVOICE" && invoiceDisabled ? "text-slate-400" : value === id ? "bg-white font-semibold text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Icon size={14} aria-hidden="true" />
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
            className="flex min-h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50"
          >
            <Ellipsis size={18} />
          </button>
        )}
      </div>
      {value === "INVOICE" &&
        !invoiceDisabled &&
        environment === "HOMOLOGATION" && (
          <p className="mt-1 text-right text-[11px] text-amber-700">
            Homologación · Sin validez fiscal
          </p>
        )}
      {value === "INVOICE" && !invoiceDisabled && summary && (
        <p
          className="mt-1 truncate text-right text-[11px] text-slate-500"
          title={summary}
        >
          {summary}
        </p>
      )}
    </fieldset>
  );
}
