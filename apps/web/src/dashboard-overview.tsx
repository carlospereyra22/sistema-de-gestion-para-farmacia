import {
  Banknote,
  CalendarClock,
  CalendarX2,
  ChevronRight,
  HandCoins,
  PackageMinus,
  PackageX,
  ReceiptText,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { WorkspaceView } from "./lib/workspace-location";
import type { CatalogMetricKey } from "./lib/product-catalog-metrics";
import type {
  DashboardMetric,
  DashboardMetricKey,
  DashboardMetricTone,
} from "./lib/dashboard-metrics";
import { metricValueClass } from "./lib/dashboard-metrics";
import { DashboardKpiTrend } from "./dashboard-kpi-trend";
import { reportCardClass } from "./report-states";

const metricIcons: Record<DashboardMetricKey, LucideIcon> = {
  sales: Banknote,
  averageTicket: ReceiptText,
  receivables: Users,
  cash: Wallet,
  supplierDebt: HandCoins,
  purchases: Truck,
};

// Icono redondo de color suave, como las tarjetas de Reportes y Productos.
const tones: Record<DashboardMetricTone, { wash: string; ink: string }> = {
  teal: { wash: "#e8faf5", ink: "#087f70" },
  blue: { wash: "#eaf3ff", ink: "#1d64d8" },
  indigo: { wash: "#eef0ff", ink: "#4f46e5" },
  emerald: { wash: "#e7f8ef", ink: "#04875a" },
  slate: { wash: "#f1f5f9", ink: "#64748b" },
  amber: { wash: "#fff4e0", ink: "#c26a06" },
  rose: { wash: "#fff1f4", ink: "#e11d48" },
  violet: { wash: "#f3effe", ink: "#7c5cd6" },
};

export function DashboardOverview({
  metrics,
  salesTrend,
  loading = false,
}: {
  metrics: DashboardMetric[];
  salesTrend?: { date: string; totalMinor: string; count: number }[];
  /** Mientras llega el resumen: esqueleto del mismo tamaño que el dato. */
  loading?: boolean;
}) {
  return (
    <div
      aria-label="Resumen de la sucursal"
      aria-busy={loading}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
    >
      {metrics.map(({ key, label, value, note, tone, rows }, index) => {
        const Icon = metricIcons[key];
        const color = tones[tone];
        const trend = key === "sales" && salesTrend && salesTrend.length >= 2;
        return (
          <article
            key={key}
            style={{ "--orden": index + 2 } as CSSProperties}
            className={`${reportCardClass} dashboard-entrada flex min-w-0 flex-col px-4 py-3.5 sm:min-h-[10.5rem]`}
          >
            <div className="flex items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: color.wash, color: color.ink }}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h2 className="min-w-0 text-[13px] font-semibold leading-4 text-slate-600">
                {label}
              </h2>
            </div>
            {loading ? (
              <div className="mt-2 min-w-0" aria-hidden="true">
                <p className="leading-8">
                  <span className="dashboard-skeleton w-28 text-2xl" />
                </p>
                <p className="mt-0.5 leading-4">
                  <span className="dashboard-skeleton w-20 text-xs" />
                </p>
              </div>
            ) : trend ? (
              <div key={value} className="dashboard-dato">
                <DashboardKpiTrend
                  days={salesTrend}
                  kind="sales"
                  color={color.ink}
                  value={value}
                  note={note}
                />
              </div>
            ) : (
              <div key={value} className="dashboard-dato mt-2 min-w-0">
                <p
                  className={`whitespace-nowrap font-bold leading-8 tracking-tight tabular-nums text-slate-900 ${metricValueClass(value)}`}
                >
                  {value}
                </p>
                {rows && (
                  <ul className="mt-1 space-y-0.5">
                    {rows.map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 shrink-0 rounded-full ${row.open ? "bg-emerald-500" : "bg-slate-300"}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-slate-600">
                          {row.label}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${row.open ? "font-semibold text-slate-800" : "text-slate-400"}`}
                        >
                          {row.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-0.5 text-xs text-slate-500">{note}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

const inventoryRows: {
  key: CatalogMetricKey;
  label: string;
  icon: LucideIcon;
  tone: DashboardMetricTone;
}[] = [
  { key: "out", label: "Sin stock", icon: PackageX, tone: "rose" },
  { key: "low", label: "Stock bajo", icon: PackageMinus, tone: "amber" },
  {
    key: "expiring",
    label: "Por vencer (90 días)",
    icon: CalendarClock,
    tone: "violet",
  },
  { key: "expired", label: "Vencidos", icon: CalendarX2, tone: "rose" },
];

/** Mismos contadores que Productos (`catalogMetricCounts`). */
export function DashboardInventoryAlerts({
  counts,
  onNavigate,
}: {
  counts: Record<CatalogMetricKey, number>;
  onNavigate: (view: WorkspaceView) => void;
}) {
  return (
    <section
      aria-labelledby="dashboard-inventory-title"
      className="cash-card flex h-full flex-col"
    >
      <div className="cash-card-heading">
        <span className="cash-icon bg-amber-50! text-amber-600!">
          <TriangleAlert size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 id="dashboard-inventory-title">Alertas de inventario</h2>
          <p className="text-xs text-slate-500">
            Productos que necesitan atención.
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-1 flex-col gap-2">
        {inventoryRows.map(({ key, label, icon: Icon, tone }) => {
          const count = counts[key];
          const color = tones[count ? tone : "slate"];
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onNavigate("Inventario")}
                className="group flex w-full items-center gap-3 rounded-xl border border-[#e8edf2] bg-white px-3 py-2.5 text-left transition-colors hover:border-teal-200 hover:bg-teal-50/40 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full"
                  style={{ backgroundColor: color.wash, color: color.ink }}
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">
                    {label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {count
                      ? `${count} ${count === 1 ? "producto" : "productos"}`
                      : "Sin productos"}
                  </span>
                </span>
                <span
                  className="text-xl font-semibold tabular-nums"
                  style={{ color: count ? color.ink : "#94a3b8" }}
                >
                  {count.toLocaleString("es-AR")}
                </span>
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-slate-400 group-hover:text-teal-600"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
