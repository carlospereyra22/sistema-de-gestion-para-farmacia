import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  Boxes,
  CheckCircle2,
  Clock3,
  CalendarClock,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  TriangleAlert,
  Zap,
  Users,
  Wallet,
  ChartNoAxesCombined,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceView } from "./lib/workspace-location";
import { DashboardKpiTrend } from "./dashboard-kpi-trend";
import { DashboardInventoryChart } from "./dashboard-inventory-chart";
export type DashboardAlert = {
  title: string;
  status: string;
  tone: string;
  note?: string;
  view?: WorkspaceView;
};
export function DashboardOverview({
  sales,
  tickets,
  outOfStock,
  expiring,
  alerts,
  onNavigate,
  salesTrend,
  inventoryBars,
}: {
  sales: string;
  tickets: string;
  outOfStock: number;
  expiring: number;
  alerts: DashboardAlert[];
  onNavigate: (view: WorkspaceView) => void;
  salesTrend?: { date: string; totalMinor: string; count: number }[];
  inventoryBars?: {
    missing: { label: string; value: number }[];
    expiry: { label: string; value: number }[];
  };
}) {
  const metrics = [
    {
      label: "Ventas hoy",
      value: sales,
      note: "Importe vendido en el día",
      icon: Banknote,
      color: "#008b75",
      view: "Reportes" as const,
    },
    {
      label: "Tickets",
      value: tickets,
      note: "Comprobantes emitidos hoy",
      icon: ReceiptText,
      color: "#1673ed",
      view: "Reportes" as const,
    },
    {
      label: "Sin stock",
      value: String(outOfStock),
      note: "Productos sin existencias",
      icon: PackageSearch,
      color: "#e88013",
      view: "Inventario" as const,
    },
    {
      label: "Vencen pronto",
      value: String(expiring),
      note: "Lotes · hasta 30 días y vencidos",
      icon: CalendarClock,
      color: "#8b45ee",
      view: "Inventario" as const,
    },
  ];
  const shortcuts = [
    {
      label: "Nueva venta",
      note: "Buscá productos y cobrá",
      view: "Ventas",
      icon: ShoppingCart,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Nueva compra",
      note: "Registrá compras y recepciones",
      view: "Compras",
      icon: ArrowDownToLine,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Clientes",
      note: "Consultá y gestioná tus clientes",
      view: "Clientes",
      icon: Users,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Cuentas corrientes",
      note: "Cobros y saldos pendientes",
      view: "Cuentas corrientes",
      icon: Wallet,
      tone: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Transferir",
      note: "Mové stock entre sucursales",
      view: "Transferencias",
      icon: ArrowLeftRight,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      label: "Inventario",
      note: "Consultá existencias y lotes",
      view: "Inventario",
      icon: Boxes,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Caja",
      note: "Sesiones y movimientos de caja",
      view: "Caja",
      icon: Banknote,
      tone: "bg-teal-50 text-teal-600",
    },
    {
      label: "Reportes",
      note: "Revisá los resultados del negocio",
      view: "Reportes",
      icon: ChartNoAxesCombined,
      tone: "bg-rose-50 text-rose-600",
    },
  ] satisfies {
    label: string;
    note: string;
    view: WorkspaceView;
    icon: typeof ShoppingCart;
    tone: string;
  }[];
  return (
    <div className="space-y-3">
      <div
        aria-label="Resumen de la sucursal"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map(({ label, value, note, icon: Icon, color }) => (
          <article
            key={label}
            className="relative rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_5px_20px_-12px_rgba(15,60,80,0.18)]"
          >
            <div className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm ring-1 ring-inset ring-white/25"
                style={{
                  backgroundColor: color,
                  backgroundImage:
                    "linear-gradient(135deg,rgba(255,255,255,.25),transparent 65%)",
                }}
              >
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h2 className="min-w-0 flex-1 text-xs font-semibold leading-4 text-slate-700">
                {label}
              </h2>
            </div>
            {salesTrend &&
            salesTrend.length >= 2 &&
            (label === "Ventas hoy" || label === "Tickets") ? (
              <DashboardKpiTrend
                days={salesTrend}
                kind={label === "Ventas hoy" ? "sales" : "tickets"}
                color={color}
                value={value}
              />
            ) : (
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="break-words text-[28px] font-bold leading-8 tracking-tight tabular-nums"
                    style={{ color }}
                  >
                    {value}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">
                    {note}
                  </p>
                </div>
                {inventoryBars &&
                  (label === "Sin stock" || label === "Vencen pronto") && (
                    <DashboardInventoryChart
                      kind={label === "Sin stock" ? "missing" : "expiry"}
                      color={color}
                      rows={
                        label === "Sin stock"
                          ? inventoryBars.missing
                          : inventoryBars.expiry
                      }
                    />
                  )}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
        <section
          aria-labelledby="dashboard-alerts-title"
          className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <BellRing size={20} />
            </span>
            <div>
              <h3
                id="dashboard-alerts-title"
                className="text-sm font-semibold text-slate-900"
              >
                Alertas y pendientes de la sucursal
              </h3>
              <p className="text-[11px] text-slate-500">
                Lo que necesita tu atención.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => {
              const normal = alert.status === "Normal";
              const Icon = normal
                ? CheckCircle2
                : alert.status === "Crítico"
                  ? TriangleAlert
                  : Clock3;
              const content = (
                <>
                  <Icon
                    size={19}
                    aria-hidden="true"
                    className={`shrink-0 ${normal ? "text-emerald-600" : alert.status === "Crítico" ? "text-rose-600" : "text-amber-600"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      {alert.title}
                    </span>
                    {alert.note && (
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {alert.note}
                      </span>
                    )}
                  </span>
                  {!normal && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${alert.tone}`}
                    >
                      {alert.status}
                    </span>
                  )}
                  {alert.view && (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-slate-400"
                    />
                  )}
                </>
              );
              const classes = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left ${normal ? "bg-slate-50 text-slate-600" : alert.status === "Crítico" ? "bg-rose-50/80 text-rose-900" : alert.status === "Pendiente" ? "bg-blue-50/70 text-slate-800" : "bg-amber-50/70 text-amber-900"}`;
              return (
                <li key={alert.title}>
                  {alert.view ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(alert.view!)}
                      className={
                        classes +
                        " hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-teal-600"
                      }
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={classes}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section
          aria-labelledby="dashboard-shortcuts-title"
          className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Zap size={20} />
            </span>
            <div>
              <h3
                id="dashboard-shortcuts-title"
                className="text-sm font-semibold text-slate-900"
              >
                Accesos rápidos
              </h3>
              <p className="text-[11px] text-slate-500">
                Opciones frecuentes para tu operación diaria.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {shortcuts.map(({ label, note, view, icon: Icon, tone }) => (
              <button
                key={view}
                type="button"
                onClick={() => onNavigate(view)}
                className="group flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/30 px-2.5 py-2 text-left transition-colors hover:border-teal-200 hover:bg-teal-50/50 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                    {note}
                  </span>
                </span>
                <ArrowUpRight
                  size={13}
                  className="shrink-0 text-slate-400 group-hover:text-teal-600"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
