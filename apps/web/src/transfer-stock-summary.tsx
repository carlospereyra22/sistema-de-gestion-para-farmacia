import { ArrowRight } from "lucide-react";

/**
 * Cuánto hay en el lote, cuánto se envía y cuánto queda después de la
 * transferencia (SISTEMA-71). El stock es el que ve esta PC, también sin
 * conexión.
 */
export function TransferStockSummary({
  available,
  sending,
}: {
  available: number;
  sending: number;
}) {
  const enviadas = Math.min(Math.max(0, sending), available);
  const queda = available - enviadas;
  return (
    <div
      aria-label="Stock del lote"
      className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          En el lote
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-800">
          {available}
        </p>
      </div>
      <ArrowRight size={16} aria-hidden className="text-slate-300" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
          Enviás
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-teal-700">
          {enviadas}
        </p>
      </div>
      <ArrowRight size={16} aria-hidden className="text-slate-300" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Te queda
        </p>
        <p
          className={`mt-0.5 text-2xl font-semibold tabular-nums ${queda === 0 ? "text-amber-600" : "text-slate-800"}`}
        >
          {queda}
        </p>
      </div>
      {queda === 0 && (
        <p className="col-span-5 mt-2 text-xs font-medium text-amber-700">
          El lote queda vacío en esta sucursal.
        </p>
      )}
    </div>
  );
}
