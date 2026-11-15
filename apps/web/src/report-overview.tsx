import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  RefreshCw,
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
import {
  tocaAnimarReportes,
  type TipoAnimacionGrafico,
} from "./lib/animacion-reportes";
import { comparisonOptions, type ReportView } from "./lib/report-view";
import { ReportCashClosuresPanel } from "./report-cash-closures";
import { ReportKpiCard } from "./report-kpi";
import { useEntrada, type EstadoEntrada } from "./lib/use-reportes-movimiento";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportSkeleton,
  reportCardClass,
} from "./report-states";

const ReportChart = lazy(() => import("./report-chart"));

/**
 * Entrada del panel que contiene a un gráfico: el gráfico se monta (y se dibuja)
 * recién cuando el panel entra en pantalla.
 */
const EntradaPanel = createContext<{ animar: boolean; estado: EstadoEntrada }>({
  animar: false,
  estado: "lista",
});

/**
 * Tarjeta de un widget. Con la entrada animada aparece la primera vez que
 * entra en pantalla, no todas juntas al cargar (SISTEMA-87, SISTEMA-90).
 */
function Panel({
  title,
  icon,
  hint,
  orden = 0,
  animar = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  hint?: string;
  /** Orden de aparición dentro de su fila. */
  orden?: number;
  animar?: boolean;
  children: ReactNode;
}): ReactElement {
  const [ref, estado] = useEntrada<HTMLElement>(animar);
  return (
    <section
      ref={ref}
      data-entrada={estado}
      className={`${reportCardClass} reportes-entrada reportes-panel min-w-0 p-4`}
      style={{ "--orden": orden } as CSSProperties}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-marca-535">{icon}</span>
        {title}
      </h2>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      ) : null}
      <div className="mt-3">
        <EntradaPanel.Provider value={{ animar, estado }}>
          {children}
        </EntradaPanel.Provider>
      </div>
    </section>
  );
}

function Chart({
  option,
  label,
  height = 260,
  tipo,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
  tipo: TipoAnimacionGrafico;
}): ReactElement {
  const { animar, estado } = useContext(EntradaPanel);
  // Mismo alto mientras espera: nada salta cuando el gráfico aparece.
  const lugar = <div style={{ height }} />;
  if (estado === "pendiente") return lugar;
  return (
    <Suspense fallback={lugar}>
      <ReportChart
        option={option}
        label={label}
        height={height}
        animacion={tipo}
        animarEntrada={animar}
      />
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
  active = true,
}: {
  token: string;
  organizationId: string;
  view: ReportView;
  onOpenInventory: () => void;
  active?: boolean;
}): ReactElement {
  const { from, to, branchId, comparison } = view;
  // El resultado se guarda con sus filtros. Al cambiar un filtro se sigue viendo
  // lo anterior (apenas atenuado y con "Actualizando…") hasta que llega lo
  // nuevo, y entonces números y gráficos van de lo anterior a lo nuevo
  // (SISTEMA-90). De otra organización o con error nunca se muestra lo viejo.
  const key = JSON.stringify([organizationId, from, to, branchId, comparison]);
  const [result, setResult] = useState<{
    key: string;
    organizationId: string;
    data: ReportOverview & { guardadaEl?: number };
  }>();
  const [error, setError] = useState<string>();
  const fresh = result?.key === key;
  const data =
    fresh || (!error && result?.organizationId === organizationId)
      ? result?.data
      : undefined;
  const actualizando = Boolean(data) && !fresh;
  const load = useCallback(() => {
    let current = true;
    setError(undefined);
    getReportOverview(token, organizationId, {
      from,
      to,
      branchId,
      comparison,
    })
      .then((next) => {
        if (current) setResult({ key, organizationId, data: next });
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
  }, [token, organizationId, from, to, branchId, comparison, key]);
  useEffect(() => {
    if (active) return load();
  }, [active, load]);
  // La entrada animada se decide una vez, cuando el Resumen se ve por primera
  // vez con datos: sólo la primera vez de la sesión (SISTEMA-87).
  // Se decide una sola vez por pantalla: en desarrollo React repite los
  // efectos, y la segunda vez ya figuraba como vista y no animaba.
  const decision = useRef<boolean>(undefined);
  const [animar, setAnimar] = useState<boolean>();
  useEffect(() => {
    if (!active || !data) return;
    decision.current ??= tocaAnimarReportes() && !data.guardadaEl;
    setAnimar(decision.current);
  }, [active, data]);
  // Cada bloque recuerda si ya hizo su entrada: un cambio de filtros no la
  // repite, y los de más abajo la hacen cuando se ven por primera vez.

  if (!data || animar === undefined)
    return error ? (
      <ReportErrorState message={error} onRetry={load} />
    ) : (
      <ReportSkeleton />
    );
  return (
    <div className="relative" aria-busy={actualizando}>
      {actualizando ? (
        <p
          role="status"
          className="reportes-actualizando pointer-events-none absolute -top-2.5 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-marca-908 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-marca-535 shadow-sm"
        >
          <RefreshCw
            size={11}
            className="motion-safe:animate-spin"
            aria-hidden
          />
          Actualizando…
        </p>
      ) : null}
      <div
        className={`transition-opacity duration-200 ${actualizando ? "opacity-70 delay-150" : ""}`}
      >
        {data.guardadaEl ? (
          <ReportCopiaGuardada guardadaEl={data.guardadaEl} />
        ) : null}
        <ReportOverviewContent
          data={data}
          comparison={comparison}
          onOpenInventory={onOpenInventory}
          animar={animar}
        />
      </div>
    </div>
  );
}

/**
 * Sin conexión el Resumen es la copia que la PC guardó del servidor
 * (SISTEMA-80, decisión del usuario): dice de cuándo son los datos.
 */
export function ReportCopiaGuardada({ guardadaEl }: { guardadaEl: number }) {
  const cuando = new Date(guardadaEl).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <p
      role="status"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      Sin conexión: datos al {cuando}. No incluye lo hecho sin conexión; se
      actualiza cuando vuelva internet.
    </p>
  );
}

/** Contenido del Resumen ya cargado (separado para poder testearlo sin red). */
export function ReportOverviewContent({
  data,
  comparison,
  onOpenInventory,
  animar = false,
}: {
  data: ReportOverview;
  comparison: ReportView["comparison"];
  onOpenInventory: () => void;
  /** Entrada animada: números que suben y gráficos que se dibujan (SISTEMA-87). */
  animar?: boolean;
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
      <div
        className={`grid gap-3 sm:grid-cols-2 ${showProfit ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Ventas netas"
          icon={<ReceiptText size={18} aria-hidden />}
          kpi={kpis.netSales}
          help="Ventas confirmadas del período menos devoluciones. No incluye anuladas ni borradores."
        />
        {showProfit ? (
          <ReportKpiCard
            animar={animar}
            orden={1}
            label="Ganancia bruta estimada"
            icon={<TrendingUp size={18} aria-hidden />}
            kpi={kpis.grossProfit}
            help="Ventas netas con costo menos el costo de los lotes vendidos. Es estimada: no descuenta gastos fijos ni impuestos."
          />
        ) : null}
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Ticket promedio"
          icon={<Wallet size={18} aria-hidden />}
          kpi={kpis.averageTicket}
          help="Total facturado dividido la cantidad de ventas confirmadas."
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label="Unidades vendidas"
          icon={<Package size={18} aria-hidden />}
          kpi={kpis.unitsSold}
          help="Unidades de venta de productos (caja, blíster o unidad según el producto), menos las devueltas."
        />
      </div>
      {/* Aclaraciones sobre los datos (por ejemplo, ventas sin costo de lote):
          una nota sobria debajo de las tarjetas que explica, no una alarma. */}
      {meta.dataQuality.warnings.length ? (
        <ul className="space-y-1.5" aria-label="Aclaraciones sobre los datos">
          {meta.dataQuality.warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-2.5 rounded-xl border border-niebla-913 bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-600"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-marca-970 text-marca-535">
                <Info size={12} aria-hidden />
              </span>
              <span>
                <strong className="font-semibold text-slate-800">
                  Para tener en cuenta:
                </strong>{" "}
                {warning}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

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
              animar={animar}
              orden={0}
              title="Evolución de ventas"
              icon={<TrendingUp size={16} aria-hidden />}
              hint={`Ventas netas por ${charts.trendGranularity === "day" ? "día" : "mes"}`}
            >
              <Chart
                tipo="linea"
                option={options.trend}
                label="Evolución de ventas netas"
              />
            </Panel>
            <Panel
              animar={animar}
              orden={1}
              title="Medios de pago"
              icon={<CreditCard size={16} aria-hidden />}
              hint="Sobre lo facturado; el vuelto se descuenta del efectivo."
            >
              {charts.paymentMethods.length ? (
                <>
                  <Chart
                    tipo="barras"
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
              animar={animar}
              orden={0}
              title="Ventas por categoría"
              icon={<Tags size={16} aria-hidden />}
              hint="Ventas netas según la categoría asignada al producto."
            >
              <Chart
                tipo="barras"
                option={options.categories}
                label="Ventas por categoría"
                height={Math.max(
                  160,
                  Math.min(8, charts.salesByCategory.length) * 34,
                )}
              />
            </Panel>
            <Panel
              animar={animar}
              orden={1}
              title="Productos más vendidos"
              icon={<Trophy size={16} aria-hidden />}
              hint="Unidades netas de devoluciones."
            >
              {charts.topProducts.length ? (
                <Chart
                  tipo="barras"
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
            animar={animar}
            orden={0}
            title="Resumen por sucursal"
            icon={<Store size={16} aria-hidden />}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
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
                  {tables.branches.map((row, index) => (
                    <tr
                      key={row.id}
                      className="reportes-fila border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50"
                      style={{ "--fila": index } as CSSProperties}
                    >
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
                    <tr
                      className="reportes-fila border-t border-marca-908 bg-teal-50 font-semibold"
                      style={
                        { "--fila": tables.branches.length } as CSSProperties
                      }
                    >
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
          animar={animar}
          orden={1}
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
              {activeAlerts.map((alert, index) => {
                const text = alertText[alert.kind](alert);
                return (
                  <li
                    key={alert.kind}
                    className="reportes-alerta"
                    style={{ "--fila": index } as CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={onOpenInventory}
                      className="group flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-marca-908 hover:bg-teal-50 hover:shadow-[0_3px_10px_rgb(25_56_74_/_6%)] focus-visible:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 motion-reduce:transform-none"
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
                        className="text-slate-400 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-marca-535 group-focus-visible:translate-x-0.5 motion-reduce:transform-none"
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

      <ReportCashClosuresPanel closures={tables.cashClosures} animar={animar} />
    </div>
  );
}
