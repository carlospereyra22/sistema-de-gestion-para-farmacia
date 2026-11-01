import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Info,
  Package,
  ReceiptText,
  Store,
  Tags,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import type { ReportAlert, ReportOverview } from "@gestion/contracts";
import type { EChartsCoreOption } from "echarts/core";
import { paymentLabels, rankingOption, trendOption } from "./lib/report-charts";
import { formatMoneyMinor } from "./lib/report-format";
import { getReportOverview } from "./lib/reports-api";
import { comparisonOptions, type ReportView } from "./lib/report-view";
import { ReportCashClosuresPanel } from "./report-cash-closures";
import { ReportKpiCard } from "./report-kpi";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportSkeleton,
  reportCardClass,
} from "./report-states";

const ReportChart = lazy(() => import("./report-chart"));

function Panel({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon: ReactNode;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className={`${reportCardClass} min-w-0 p-4`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-[#087f70]">{icon}</span>
        {title}
      </h2>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chart({
  option,
  label,
  height,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
}): ReactElement {
  return (
    <Suspense fallback={<div style={{ height: height ?? 260 }} />}>
      <ReportChart option={option} label={label} height={height} />
    </Suspense>
  );
}

const alertText: Record<
  ReportAlert["kind"],
  (alert: ReportAlert) => { title: string; detail: string }
> = {
  expired: (alert) => ({
    title: `${alert.count} ${alert.count === 1 ? "lote vencido" : "lotes vencidos"} con existencia`,
    detail: "Revisá devoluciones o bajas en Inventario.",
  }),
  expiring: (alert) => ({
    title: `${alert.count} ${alert.count === 1 ? "lote vence" : "lotes vencen"} en ${alert.threshold} días`,
    detail: "Lotes con existencia y vencimiento próximo.",
  }),
  lowStock: (alert) => ({
    title: `${alert.count} ${alert.count === 1 ? "producto" : "productos"} con stock bajo`,
    detail: `Stock vendible de ${alert.threshold} unidades o menos.`,
  }),
};

/**
 * Pestana Resumen: KPIs, evolucion, medios de pago, categorias, productos, tabla por
 * sucursal, alertas y cierres de caja. Todo sale de `reports/overview`.
 */
export function ReportOverviewTab({
  token,
  organizationId,
  view,
  onOpenInventory,
}: {
  token: string;
  organizationId: string;
  view: ReportView;
  onOpenInventory: () => void;
}): ReactElement {
  const [data, setData] = useState<ReportOverview>();
  const [error, setError] = useState<string>();
  const { from, to, branchId, comparison } = view;
  const load = useCallback(() => {
    let current = true;
    setError(undefined);
    setData(undefined);
    getReportOverview(token, organizationId, {
      from,
      to,
      branchId,
      comparison,
    })
      .then((next) => {
        if (current) setData(next);
      })
      .catch((cause: unknown) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el Resumen.",
          );
      });
    return () => {
      current = false;
    };
  }, [token, organizationId, from, to, branchId, comparison]);
  useEffect(load, [load]);

  if (error) return <ReportErrorState message={error} onRetry={load} />;
  if (!data) return <ReportSkeleton />;
  return (
    <ReportOverviewContent
      data={data}
      comparison={comparison}
      onOpenInventory={onOpenInventory}
    />
  );
}

/** Contenido del Resumen ya cargado (separado para poder testearlo sin red). */
export function ReportOverviewContent({
  data,
  comparison,
  onOpenInventory,
}: {
  data: ReportOverview;
  comparison: ReportView["comparison"];
  onOpenInventory: () => void;
}): ReactElement {
  const comparisonLabel =
    comparison === "none"
      ? null
      : (comparisonOptions.find((option) => option.id === comparison)?.label ??
        null);
  const options = useMemo(
    () => ({
      trend: trendOption(
        data.charts.salesTrend,
        data.charts.trendGranularity,
        comparisonLabel,
      ),
      payments: rankingOption(
        data.charts.paymentMethods.map((item) => ({
          name: paymentLabels[item.name] ?? item.name,
          value: Number(item.value),
          share: item.sharePct,
        })),
        "money",
      ),
      categories: rankingOption(
        data.charts.salesByCategory
          .slice(0, 8)
          .map((item) => ({ name: item.name, value: Number(item.value) })),
        "money",
      ),
      products: rankingOption(
        data.charts.topProducts.map((item) => ({
          name: item.name,
          value: item.units,
        })),
        "units",
      ),
    }),
    [data, comparisonLabel],
  );
  const { kpis, charts, tables, meta } = data;
  const showProfit = kpis.grossProfit.unavailableReason !== "FORBIDDEN";
  const empty = kpis.unitsSold.value === "0" && kpis.netSales.value === "0";
  const activeAlerts = tables.alerts.filter((alert) => alert.count > 0);
  // Con una sola sucursal la tabla repetiria las tarjetas.
  const showBranches = tables.branches.length > 1;

  return (
    <div className="space-y-4">
      {meta.dataQuality.warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          {warning}
        </p>
      ))}
      <div
        className={`grid gap-3 sm:grid-cols-2 ${showProfit ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        <ReportKpiCard
          label="Ventas netas"
          icon={<ReceiptText size={18} aria-hidden />}
          kpi={kpis.netSales}
          help="Ventas confirmadas del período menos devoluciones. No incluye anuladas ni borradores."
        />
        {showProfit ? (
          <ReportKpiCard
            label="Ganancia bruta estimada"
            icon={<TrendingUp size={18} aria-hidden />}
            kpi={kpis.grossProfit}
            help="Ventas netas con costo menos el costo de los lotes vendidos. Es estimada: no descuenta gastos fijos ni impuestos."
          />
        ) : null}
        <ReportKpiCard
          label="Ticket promedio"
          icon={<Wallet size={18} aria-hidden />}
          kpi={kpis.averageTicket}
          help="Total facturado dividido la cantidad de ventas confirmadas."
        />
        <ReportKpiCard
          label="Unidades vendidas"
          icon={<Package size={18} aria-hidden />}
          kpi={kpis.unitsSold}
          help="Unidades de venta de productos (caja, blíster o unidad según el producto), menos las devueltas."
        />
      </div>

      {empty ? (
        <div className={reportCardClass}>
          <ReportEmptyState
            title="Sin ventas para el período"
            description="Probá con otro rango de fechas o sucursal."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Evolución de ventas"
              icon={<TrendingUp size={16} aria-hidden />}
              hint={`Ventas netas por ${charts.trendGranularity === "day" ? "día" : "mes"}`}
            >
              <Chart option={options.trend} label="Evolución de ventas netas" />
            </Panel>
            <Panel
              title="Medios de pago"
              icon={<CreditCard size={16} aria-hidden />}
              hint="Sobre lo facturado; el vuelto se descuenta del efectivo."
            >
              {charts.paymentMethods.length ? (
                <>
                  <Chart
                    option={options.payments}
                    label="Ventas por medio de pago"
                    height={Math.max(150, charts.paymentMethods.length * 44)}
                  />
                  <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs tabular-nums">
                    <span className="text-slate-500">Total facturado</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoneyMinor(
                        charts.paymentMethods
                          .reduce((sum, item) => sum + BigInt(item.value), 0n)
                          .toString(),
                      )}
                    </span>
                  </p>
                </>
              ) : (
                <ReportEmptyState title="Sin cobros en el período" />
              )}
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Ventas por categoría"
              icon={<Tags size={16} aria-hidden />}
              hint="Ventas netas según la categoría asignada al producto."
            >
              <Chart
                option={options.categories}
                label="Ventas por categoría"
                height={Math.max(
                  160,
                  Math.min(8, charts.salesByCategory.length) * 34,
                )}
              />
            </Panel>
            <Panel
              title="Productos más vendidos"
              icon={<Trophy size={16} aria-hidden />}
              hint="Unidades netas de devoluciones."
            >
              {charts.topProducts.length ? (
                <Chart
                  option={options.products}
                  label="Productos más vendidos"
                  height={Math.max(160, charts.topProducts.length * 30)}
                />
              ) : (
                <ReportEmptyState title="Sin productos vendidos" />
              )}
            </Panel>
          </div>
        </>
      )}

      <div
        className={`grid gap-4 ${showBranches ? "xl:grid-cols-[1.6fr_1fr]" : ""}`}
      >
        {showBranches ? (
          <Panel
            title="Resumen por sucursal"
            icon={<Store size={16} aria-hidden />}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-[#f6faf9] text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Sucursal</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Ventas netas
                    </th>
                    {showProfit ? (
                      <th className="px-3 py-2 text-right font-semibold">
                        Ganancia est.
                      </th>
                    ) : null}
                    <th className="px-3 py-2 text-right font-semibold">
                      Tickets
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Unidades
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.branches.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{row.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyMinor(row.netSalesMinor)}
                      </td>
                      {showProfit ? (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.grossProfitMinor === null
                            ? "—"
                            : formatMoneyMinor(row.grossProfitMinor)}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.tickets}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.unitsSold}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {row.sharePct?.toLocaleString("es-AR") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {tables.branches.length > 1 ? (
                  <tfoot>
                    <tr className="border-t border-[#cce8de] bg-[#f2fbf8] font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kpis.netSales.value
                          ? formatMoneyMinor(kpis.netSales.value)
                          : "—"}
                      </td>
                      {showProfit ? (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {kpis.grossProfit.value
                            ? formatMoneyMinor(kpis.grossProfit.value)
                            : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {tables.branches.reduce(
                          (sum, row) => sum + row.tickets,
                          0,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kpis.unitsSold.value}
                      </td>
                      <td className="px-3 py-2 text-right">100</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Panel>
        ) : null}
        <Panel
          title="Alertas de inventario"
          icon={<AlertTriangle size={16} aria-hidden />}
          hint="Estado actual, no depende del período."
        >
          {activeAlerts.length ? (
            <ul
              className={
                showBranches ? "space-y-2" : "grid gap-2 md:grid-cols-3"
              }
            >
              {activeAlerts.map((alert) => {
                const text = alertText[alert.kind](alert);
                return (
                  <li key={alert.kind}>
                    <button
                      type="button"
                      onClick={onOpenInventory}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:border-[#cce8de] hover:bg-[#f2fbf8]"
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full ${alert.kind === "expired" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}
                      >
                        {alert.kind === "lowStock" ? (
                          <Boxes size={16} aria-hidden />
                        ) : (
                          <CalendarClock size={16} aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800">
                          {text.title}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {text.detail}
                        </span>
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-slate-400"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ReportEmptyState title="Sin alertas de inventario" />
          )}
        </Panel>
      </div>

      <ReportCashClosuresPanel closures={tables.cashClosures} />
    </div>
  );
}
