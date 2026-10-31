import { useEffect, useState } from "react";
import { ArrowRight, Clock3, ReceiptText } from "lucide-react";
import { getSales, type Sale } from "./lib/api";

export function DashboardRecentSales({
  token,
  organizationId,
  branchId,
  onOpenHistory,
  active = true,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  onOpenHistory: () => void;
  active?: boolean;
}) {
  const scope = `${organizationId}:${branchId}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; sales: Sale[] }>();
  const sales = snapshot?.scope === scope ? snapshot.sales : undefined;
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let current = true;
    setError("");
    void getSales(token, organizationId, branchId)
      .then((result) => {
        if (current)
          setSnapshot({
            scope,
            sales: [...result]
              .sort((a, b) =>
                (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
              )
              .slice(0, 5),
          });
      })
      .catch(() => {
        if (current)
          setError(
            "No se pudieron actualizar las últimas ventas. Los datos visibles corresponden a la última consulta.",
          );
      });
    return () => {
      current = false;
    };
  }, [active, token, organizationId, branchId, scope]);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_-10px_rgba(15,60,80,0.18)]">
      <div className="flex items-center justify-between gap-2 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100/70">
            <Clock3 size={21} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Últimas ventas
            </h3>
            <p className="text-[11px] text-slate-500">
              Actividad reciente de la sucursal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          Ver historial
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="overflow-x-auto px-3 pb-2">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-y border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {["Fecha y hora", "Venta / comprobante", "Estado", "Importe"].map(
                (label) => (
                  <th
                    key={label}
                    className={`px-3 py-2.5 font-semibold ${label === "Importe" ? "text-right" : ""}`}
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sales?.map((sale) => (
              <tr
                key={sale.id}
                className="border-b border-slate-100 transition-colors even:bg-slate-50/30 last:border-0 hover:bg-teal-50/40"
              >
                <td className="w-[23%] whitespace-nowrap px-3 py-2.5 text-xs font-medium tabular-nums text-slate-700">
                  {sale.completedAt
                    ? new Date(sale.completedAt).toLocaleString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        dateStyle: "short",
                      })
                    : "Sin fecha"}
                  {sale.completedAt && (
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                      {new Date(sale.completedAt).toLocaleTimeString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}{" "}
                      hs
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg ${sale.status === "CANCELLED" ? "bg-slate-100 text-slate-400" : "bg-teal-50 text-teal-600"}`}
                    >
                      <ReceiptText size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="font-semibold text-slate-700">
                        Venta {sale.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {sale.items.length}{" "}
                        {sale.items.length === 1 ? "artículo" : "artículos"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ring-inset ${sale.status === "CANCELLED" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-current opacity-70"
                    />
                    {sale.status === "CANCELLED" ? "Anulada" : "Completada"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-slate-800">
                  {(Number(sale.totalMinor) / 100).toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!sales?.length || error) && (
          <p role="status" className="py-6 text-center text-xs text-slate-500">
            {error ||
              (!sales
                ? "Cargando actividad…"
                : "Todavía no hay ventas registradas en esta sucursal.")}
          </p>
        )}
      </div>
    </section>
  );
}
