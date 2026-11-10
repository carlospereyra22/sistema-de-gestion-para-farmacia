import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, Clock3, ReceiptText } from "lucide-react";
import { getSales } from "./lib/api";
import { SinConexionError } from "./lib/api-fetch";
import { ventasDeLaPc } from "./lib/bandeja-ventas";
import {
  historialConPendientes,
  type VentaDelHistorial,
} from "./lib/historial-con-pendientes";

export function DashboardRecentSales({
  token,
  organizationId,
  branchId,
  onOpenHistory,
  active = true,
  skeleton = false,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  onOpenHistory: () => void;
  active?: boolean;
  /** Con conexión: filas de esqueleto mientras carga (SISTEMA-85). */
  skeleton?: boolean;
}) {
  const scope = `${organizationId}:${branchId}`;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    sales: VentaDelHistorial[];
  }>();
  const sales = snapshot?.scope === scope ? snapshot.sales : undefined;
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let current = true;
    setError("");
    // Con las ventas de esta PC que todavía no se enviaron (SISTEMA-86).
    void Promise.all([
      getSales(token, organizationId, branchId).catch((cause: unknown) => {
        if (cause instanceof SinConexionError) return [];
        throw cause;
      }),
      ventasDeLaPc().catch(() => []),
    ])
      .then(([result, bandeja]) => {
        if (current)
          setSnapshot({
            scope,
            sales: historialConPendientes(
              result,
              bandeja,
              organizationId,
              branchId,
            )
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
    <section className="cash-card flex h-full flex-col p-0! overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="cash-icon">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Últimas ventas
            </h2>
            <p className="text-xs text-slate-500">
              Actividad reciente de la sucursal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm! font-medium text-teal-700 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          Ver historial
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="overflow-x-auto px-3 pb-2">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-y border-slate-100 bg-slate-50/80 text-xs text-slate-500">
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
            {!sales &&
              !error &&
              skeleton &&
              [0, 1, 2, 3].map((row) => (
                <tr
                  key={`esqueleto-${row}`}
                  aria-hidden="true"
                  className="border-b border-slate-100 last:border-0"
                >
                  {["w-16", "w-36", "w-20", "w-20 text-right"].map((width) => (
                    <td
                      key={width}
                      className={`px-3 py-3.5 ${width.includes("text-right") ? "text-right" : ""}`}
                    >
                      <span
                        className={`dashboard-skeleton ${width.replace(" text-right", "")}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            {sales?.map((sale, index) => (
              <tr
                key={sale.id}
                style={{ "--orden": index } as CSSProperties}
                className="dashboard-entrada border-b border-slate-100 transition-colors even:bg-slate-50/30 last:border-0 hover:bg-teal-50/40"
              >
                <td className="w-[23%] whitespace-nowrap px-3 py-2.5 text-sm font-medium tabular-nums text-slate-700">
                  {sale.completedAt
                    ? new Date(sale.completedAt).toLocaleString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        dateStyle: "short",
                      })
                    : "Sin fecha"}
                  {sale.completedAt && (
                    <span className="mt-0.5 block text-xs font-normal text-slate-400">
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
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {sale.items.length}{" "}
                        {sale.items.length === 1 ? "artículo" : "artículos"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${sale.status === "CANCELLED" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-current opacity-70"
                    />
                    {sale.status === "CANCELLED"
                      ? "Anulada"
                      : sale.porEnviar
                        ? "Por enviar"
                        : "Completada"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
                  {(Number(sale.totalMinor) / 100).toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {((sales && !sales.length) || error || (!sales && !skeleton)) && (
          <p role="status" className="py-8 text-center text-sm text-slate-500">
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
