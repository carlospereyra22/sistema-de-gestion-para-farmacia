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
      {/* Una sola línea de alto fijo, siempre reservada, para que el cobro no
          cambie de tamaño al pasar de comprobante interno a factura
          (SISTEMA-104). Si no entra, se corta y el título la muestra entera. */}
      {(() => {
        const avisos: { texto: string; alerta: boolean }[] = [];
        if (value === "INTERNAL")
          avisos.push({
            texto:
              "No va a ARCA · Se puede facturar después desde el historial",
            alerta: false,
          });
        else if (!invoiceDisabled) {
          if (environment === "HOMOLOGATION")
            avisos.push({
              texto: "Homologación · Sin validez fiscal",
              alerta: true,
            });
          if (sinCaja)
            avisos.push({
              texto:
                "Sin caja abierta: se emite al incorporar el cobro a una caja",
              alerta: true,
            });
          if (summary) avisos.push({ texto: summary, alerta: false });
        }
        return (
          <p
            className="mt-1.5 h-4 truncate text-[11px] leading-4"
            title={avisos.map((aviso) => aviso.texto).join(" · ") || undefined}
          >
            {avisos.map((aviso, index) => (
              <span
                key={aviso.texto}
                className={aviso.alerta ? "text-amber-700" : "text-slate-500"}
              >
                {index > 0 && <span className="text-slate-300"> · </span>}
                {aviso.texto}
              </span>
            ))}
          </p>
        );
      })()}
    </fieldset>
  );
}
