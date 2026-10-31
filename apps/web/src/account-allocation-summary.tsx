import type { paymentAllocationSummary } from "./lib/account-payment-allocation";
const money = (value: number) =>
  (value / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
export function AccountAllocationSummary({
  rows,
}: {
  rows: ReturnType<typeof paymentAllocationSummary>;
}) {
  const partial = rows.filter((row) => row.applied > 0 && row.remaining > 0);
  if (!partial.length) return null;
  return (
    <section
      aria-label="Aplicación del cobro"
      className="mt-3 rounded-lg bg-teal-50/60 px-3 py-2.5"
    >
      <h4 className="text-xs font-semibold text-slate-700">Cobro parcial</h4>
      <div className="mt-1.5 max-h-40 space-y-2 overflow-y-auto">
        {partial.map((row) => (
          <div key={row.saleId} className="text-[11px]">
            <div className="flex items-center justify-between gap-2 text-teal-800">
              <span>Venta {row.saleId.slice(0, 8).toUpperCase()}</span>
              <span className="font-medium">{money(row.applied)}</span>
            </div>
            <p className="mt-0.5 text-slate-500">
              Quedan {money(row.remaining)} pendientes
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
