import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Clock,
  CreditCard,
  Flame,
  Package,
  ReceiptText,
  ShoppingBasket,
  Store,
  Tags,
  TicketPercent,
  TrendingUp,
  Trophy,
  Undo2,
  Wallet,
} from "lucide-react";
import type {
  ReportKpi,
  ReportSales,
  ReportSalesTrendUnit,
} from "@gestion/contracts";
import { paymentLabels, rankingOption } from "./lib/report-charts";
import {
  branchTrendOption,
  donutOption,
  heatmapOption,
  hourLabel,
  hourOption,
  salesTrendOption,
  weekdayName,
} from "./lib/report-charts-ventas";
import { simpleColumnsOption } from "./lib/report-charts-tabs";
import { reportCategorical } from "./lib/report-chart-theme";
import { formatMoneyMinor, kpiTrend } from "./lib/report-format";
import { getReportSales } from "./lib/reports-api";
import { comparisonOptions, type ReportView } from "./lib/report-view";
import { ReportKpiCard } from "./report-kpi";
import {
  ReportPanel,
  ReportPanelChart,
  ReportSegmented,
  ReportUpdatingFrame,
  ReportWarnings,
} from "./report-panel";
import { useReportResult } from "./lib/use-report-result";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportSkeleton,
  reportCardClass,
} from "./report-states";

const unidades: readonly { id: ReportSalesTrendUnit; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

/**
 * Pestaña Ventas (SISTEMA-115): KPIs, lectura rápida, evolución (total o por
 * sucursal), medios de pago, horas, mapa de calor, categorías y sucursales.
 * Todo sale de `reports/sales`, con las mismas fórmulas que el Resumen.
 */
export function ReportSalesTab({
  token,
  organizationId,
  view,
  active = true,
}: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  const { from, to, branchId, comparison } = view;
  // Sin elegir, la API agrupa sola: por día hasta 3 meses, por mes más largo.
  const [granularity, setGranularity] = useState<ReportSalesTrendUnit>();
  const { data, error, actualizando, animar, load } = useReportResult({
    active,
    organizationId,
    filtros: [from, to, branchId, comparison, granularity],
    cargar: () =>
      getReportSales(token, organizationId, {
        from,
        to,
        branchId,
        comparison,
        granularity,
      }),
    errorPorDefecto: "No se pudo cargar Ventas.",
  });
  if (!data || animar === undefined)
    return error ? (
      <ReportErrorState message={error} onRetry={load} />
    ) : (
      <ReportSkeleton />
    );
  return (
    <ReportUpdatingFrame actualizando={actualizando}>
      <ReportSalesContent
        data={data}
        comparison={comparison}
        animar={animar}
        onGranularity={setGranularity}
      />
    </ReportUpdatingFrame>
  );
}

/** Contenido de Ventas ya cargado (separado para testearlo sin red). */
export function ReportSalesContent({
  data,
  comparison,
  animar = false,
  onGranularity,
}: {
  data: ReportSales;
  comparison: ReportView["comparison"];
  animar?: boolean;
  onGranularity: (unit: ReportSalesTrendUnit) => void;
}): ReactElement {
  const { kpis, charts, tables, meta } = data;
  const comparisonLabel =
    comparison === "none"
      ? null
      : (comparisonOptions.find((option) => option.id === comparison)?.label ??
        null);
  const severalBranches = tables.branches.length > 1;
  const [trendView, setTrendView] = useState<"total" | "branches">("total");
  const [categoryMetric, setCategoryMetric] = useState<"amount" | "units">(
    "amount",
  );
  const [productMetric, setProductMetric] = useState<"units" | "amount">(
    "units",
  );
  const showBranchLines =
    severalBranches && trendView === "branches" && charts.branchTrend.length;
  const options = useMemo(
    () => ({
      trend: showBranchLines
        ? branchTrendOption(
            charts.trend.map((point) => point.bucket),
            charts.branchTrend,
            charts.trendUnit,
          )
        : salesTrendOption(charts.trend, charts.trendUnit, comparisonLabel),
      payments: donutOption(
        charts.paymentMethods.map((item) => ({
          name: paymentLabels[item.name] ?? item.name,
          value: Number(item.value),
        })),
      ),
      hours: hourOption(charts.byHour, comparisonLabel),
      heatmap: heatmapOption(charts.heatmap),
      ticketSizes: simpleColumnsOption(
        charts.ticketSizes.map((row) => ({
          name: row.name,
          value: row.tickets,
          detail: `${formatMoneyMinor(row.amountMinor)} en total`,
        })),
        "count",
        reportCategorical[1],
      ),
      weekdays: simpleColumnsOption(
        charts.weekdayAverage.map((row) => ({
          name: weekdayName(row.weekday),
          value: Number(row.averageMinor),
          detail: `Promedio de ${row.days} ${row.days === 1 ? "día" : "días"}`,
        })),
        "money",
        reportCategorical[0],
      ),
      products: rankingOption(
        charts.topProducts
          .slice()
          .sort((left, right) =>
            productMetric === "units"
              ? right.units - left.units
              : Number(BigInt(right.value) - BigInt(left.value)),
          )
          .slice(0, 10)
          .map((item) => ({
            name: item.name,
            value: productMetric === "units" ? item.units : Number(item.value),
            share: productMetric === "units" ? undefined : item.sharePct,
          })),
        productMetric === "units" ? "units" : "money",
      ),
      categories: rankingOption(
        charts.categories
          .slice()
          .sort((left, right) =>
            categoryMetric === "units"
              ? right.units - left.units
              : Number(BigInt(right.value) - BigInt(left.value)),
          )
          .slice(0, 10)
          .map((item) => ({
            name: item.name,
            value: categoryMetric === "units" ? item.units : Number(item.value),
            share: categoryMetric === "units" ? undefined : item.sharePct,
          })),
        categoryMetric === "units" ? "units" : "money",
      ),
    }),
    [charts, comparisonLabel, showBranchLines, categoryMetric, productMetric],
  );
  const empty = kpis.tickets.value === "0";
  const paymentsTotal = charts.paymentMethods
    .reduce((sum, item) => sum + BigInt(item.value), 0n)
    .toString();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Ventas netas"
          icon={<ReceiptText size={18} aria-hidden />}
          kpi={kpis.netSales}
          help="Ventas confirmadas del período menos devoluciones. No incluye anuladas ni borradores. Coincide con el Resumen."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Tickets"
          icon={<ShoppingBasket size={18} aria-hidden />}
          kpi={kpis.tickets}
          help="Cantidad de ventas confirmadas. Una venta devuelta entera sigue contando."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Ticket promedio"
          icon={<Wallet size={18} aria-hidden />}
          kpi={kpis.averageTicket}
          help="Total facturado dividido la cantidad de tickets."
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
      <ReportWarnings warnings={meta.dataQuality.warnings} />

      {empty ? (
        <div className={reportCardClass}>
          <ReportEmptyState
            title="Sin ventas para el período"
            description="Probá con otro rango de fechas o sucursal."
          />
        </div>
      ) : (
        <>
          <ReportPanel
            animar={animar}
            orden={0}
            title="Lectura rápida"
            icon={<Flame size={16} aria-hidden />}
            hint="Lo que más conviene mirar del período, en una línea."
          >
            <SalesInsights data={data} />
          </ReportPanel>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <ReportPanel
              animar={animar}
              orden={0}
              title="Evolución de ventas"
              icon={<TrendingUp size={16} aria-hidden />}
              hint={
                showBranchLines
                  ? "Ventas netas de cada sucursal."
                  : "Ventas netas; en el detalle, los tickets de cada tramo."
              }
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  {severalBranches ? (
                    <ReportSegmented
                      label="Ver la evolución"
                      value={trendView}
                      options={[
                        { id: "total", label: "Total" },
                        { id: "branches", label: "Por sucursal" },
                      ]}
                      onChange={setTrendView}
                    />
                  ) : null}
                  <ReportSegmented
                    label="Agrupar la evolución por"
                    value={charts.trendUnit}
                    options={unidades}
                    onChange={onGranularity}
                  />
                </div>
              }
            >
              <ReportPanelChart
                tipo="linea"
                option={options.trend}
                label="Evolución de ventas netas"
                height={300}
              />
            </ReportPanel>
            <ReportPanel
              animar={animar}
              orden={1}
              title="Productos más vendidos"
              icon={<Trophy size={16} aria-hidden />}
              hint={
                productMetric === "units"
                  ? "Unidades netas de devoluciones."
                  : "Ventas netas de cada producto y su parte del total."
              }
              action={
                <ReportSegmented
                  label="Ordenar productos por"
                  value={productMetric}
                  options={[
                    { id: "units", label: "Unidades" },
                    { id: "amount", label: "Facturación" },
                  ]}
                  onChange={setProductMetric}
                />
              }
            >
              {charts.topProducts.length ? (
                <ReportPanelChart
                  tipo="barras"
                  option={options.products}
                  label="Productos más vendidos"
                  height={300}
                />
              ) : (
                <ReportEmptyState title="Sin productos vendidos en el período" />
              )}
            </ReportPanel>
          </div>

          <ReportPanel
            animar={animar}
            title="¿Cuándo se vende?"
            icon={<CalendarDays size={16} aria-hidden />}
            hint="Facturado por día de la semana y hora. Para armar turnos, reponer antes del pico y elegir cuándo lanzar una oferta."
          >
            <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
              <ReportPanelChart
                tipo="mapa"
                option={options.heatmap}
                label="Mapa de calor de ventas por día y hora"
                height={300}
              />
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">
                  Por hora
                  {comparisonLabel ? ", contra el período comparado" : ""}
                </p>
                <ReportPanelChart
                  tipo="barras"
                  option={options.hours}
                  label="Ventas por hora"
                  height={280}
                />
              </div>
            </div>
          </ReportPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportPanel
              animar={animar}
              orden={0}
              title="¿Cuánto se gasta por compra?"
              icon={<Wallet size={16} aria-hidden />}
              hint="Cantidad de tickets por importe. Sirve para armar combos y ofertas que suban el ticket."
            >
              <ReportPanelChart
                tipo="barras"
                option={options.ticketSizes}
                label="Tickets por importe"
              />
            </ReportPanel>
            <ReportPanel
              animar={animar}
              orden={1}
              title="Venta promedio por día de la semana"
              icon={<CalendarDays size={16} aria-hidden />}
              hint="Lo facturado cada día dividido las veces que ese día cayó en el período. Para organizar turnos y pedidos."
            >
              <ReportPanelChart
                tipo="barras"
                option={options.weekdays}
                label="Venta promedio por día de la semana"
              />
            </ReportPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportPanel
              animar={animar}
              orden={0}
              title="Categorías más vendidas"
              icon={<Tags size={16} aria-hidden />}
              hint={
                categoryMetric === "units"
                  ? "Unidades netas de devoluciones."
                  : "Ventas netas y su parte del total."
              }
              action={
                <ReportSegmented
                  label="Ordenar categorías por"
                  value={categoryMetric}
                  options={[
                    { id: "amount", label: "Importe" },
                    { id: "units", label: "Unidades" },
                  ]}
                  onChange={setCategoryMetric}
                />
              }
            >
              {charts.categories.length ? (
                <ReportPanelChart
                  tipo="barras"
                  option={options.categories}
                  label="Categorías más vendidas"
                  height={Math.max(
                    160,
                    Math.min(10, charts.categories.length) * 32,
                  )}
                />
              ) : (
                <ReportEmptyState title="Sin categorías con ventas" />
              )}
            </ReportPanel>
            <ReportPanel
              animar={animar}
              orden={1}
              title="Medios de pago"
              icon={<CreditCard size={16} aria-hidden />}
              hint="Sobre lo facturado; los pagos mixtos se reparten y el vuelto sale del efectivo."
            >
              {charts.paymentMethods.length ? (
                <>
                  <ReportPanelChart
                    tipo="torta"
                    option={options.payments}
                    label="Ventas por medio de pago"
                    height={220}
                  />
                  <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs tabular-nums">
                    <span className="text-slate-500">Total facturado</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoneyMinor(paymentsTotal)}
                    </span>
                  </p>
                </>
              ) : (
                <ReportEmptyState title="Sin cobros en el período" />
              )}
            </ReportPanel>
          </div>

          {severalBranches ? (
            <ReportPanel
              animar={animar}
              title="Detalle por sucursal"
              icon={<Store size={16} aria-hidden />}
              hint={
                comparisonLabel
                  ? `Variación contra ${comparisonLabel.toLowerCase()}.`
                  : undefined
              }
            >
              <BranchTable data={data} showChange={Boolean(comparisonLabel)} />
            </ReportPanel>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Una tarjeta chica de la lectura rápida. */
function Insight({
  icon,
  title,
  value,
  detail,
  tone = "neutral",
  index,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail?: ReactNode;
  tone?: "good" | "bad" | "neutral";
  index: number;
}): ReactElement {
  return (
    <li
      className="reportes-fila flex min-w-0 items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5"
      style={{ "--fila": index } as CSSProperties}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-marca-970 text-marca-535">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-slate-500">{title}</span>
        <span className="block truncate text-sm font-semibold text-slate-800 tabular-nums">
          {value}
        </span>
        {detail ? (
          <span
            className={`block text-[11px] tabular-nums ${
              tone === "good"
                ? "text-emerald-700"
                : tone === "bad"
                  ? "text-rose-600"
                  : "text-slate-500"
            }`}
          >
            {detail}
          </span>
        ) : null}
      </span>
    </li>
  );
}

const pct = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("es-AR")} %`;

/** Variación corta para la lectura rápida ("+12 % vs. anterior"). */
function change(kpi: ReportKpi, higherIsBetter: boolean) {
  const trend = kpiTrend(kpi, higherIsBetter);
  return trend.direction === "none"
    ? null
    : { text: `${trend.text} vs. anterior`, tone: trend.tone };
}

function SalesInsights({ data }: { data: ReportSales }): ReactElement {
  const { insights } = data.tables;
  const items: Omit<Parameters<typeof Insight>[0], "index">[] = [];
  if (insights.peakHour)
    items.push({
      icon: <Clock size={16} aria-hidden />,
      title: "Hora pico",
      value: `${hourLabel(insights.peakHour.hour)} a ${hourLabel(insights.peakHour.hour + 1)}`,
      detail: `${pct(insights.peakHour.sharePct)} de lo facturado`,
    });
  if (insights.bestWeekday)
    items.push({
      icon: <CalendarDays size={16} aria-hidden />,
      title: "Día más fuerte",
      value: weekdayName(insights.bestWeekday.weekday),
      detail: `${pct(insights.bestWeekday.sharePct)} de lo facturado`,
    });
  if (insights.topBranch)
    items.push({
      icon: <Store size={16} aria-hidden />,
      title: "Sucursal que más vende",
      value: insights.topBranch.name,
      detail: `${pct(insights.topBranch.sharePct)} de las ventas netas`,
    });
  const discounts = change(insights.discounts, false);
  items.push({
    icon: <TicketPercent size={16} aria-hidden />,
    title: "Descuentos otorgados",
    value: formatMoneyMinor(insights.discounts.value ?? "0"),
    detail: discounts?.text ?? "Descuentos de línea y generales",
    tone: discounts?.tone,
  });
  const returns = change(insights.returns, false);
  items.push({
    icon: <Undo2 size={16} aria-hidden />,
    title: "Devoluciones",
    value: `${formatMoneyMinor(insights.returns.value ?? "0")} · ${pct(insights.returnRatePct)}`,
    detail: returns?.text ?? "Sobre lo facturado del período",
    tone: returns?.tone,
  });
  if (insights.unitsPerTicket !== null)
    items.push({
      icon: <Package size={16} aria-hidden />,
      title: "Unidades por ticket",
      value: insights.unitsPerTicket.toLocaleString("es-AR"),
      detail: "Más unidades por ticket = mejor venta cruzada",
    });
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item, index) => (
        <Insight key={item.title} {...item} index={index} />
      ))}
    </ul>
  );
}

function BranchTable({
  data,
  showChange,
}: {
  data: ReportSales;
  showChange: boolean;
}): ReactElement {
  const rows = data.tables.branches;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Sucursal</th>
            <th className="px-3 py-2 text-right font-semibold">Ventas netas</th>
            {showChange ? (
              <th className="px-3 py-2 text-right font-semibold">Var.</th>
            ) : null}
            <th className="px-3 py-2 text-right font-semibold">Tickets</th>
            <th className="px-3 py-2 text-right font-semibold">Ticket prom.</th>
            <th className="px-3 py-2 text-right font-semibold">Unidades</th>
            <th className="px-3 py-2 text-right font-semibold">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className="reportes-fila border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50"
              style={{ "--fila": index } as CSSProperties}
            >
              <td className="px-3 py-2 text-slate-800">{row.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatMoneyMinor(row.netSalesMinor)}
              </td>
              {showChange ? (
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    row.changePct === null
                      ? "text-slate-400"
                      : row.changePct >= 0
                        ? "text-emerald-700"
                        : "text-rose-600"
                  }`}
                >
                  {row.changePct === null
                    ? "—"
                    : `${row.changePct > 0 ? "+" : row.changePct < 0 ? "−" : ""}${Math.abs(row.changePct).toLocaleString("es-AR")} %`}
                </td>
              ) : null}
              <td className="px-3 py-2 text-right tabular-nums">
                {row.tickets.toLocaleString("es-AR")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.averageTicketMinor === null
                  ? "—"
                  : formatMoneyMinor(row.averageTicketMinor)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.unitsSold.toLocaleString("es-AR")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                {row.sharePct?.toLocaleString("es-AR") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            className="reportes-fila border-t border-marca-908 bg-teal-50 font-semibold"
            style={{ "--fila": rows.length } as CSSProperties}
          >
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {data.kpis.netSales.value
                ? formatMoneyMinor(data.kpis.netSales.value)
                : "—"}
            </td>
            {showChange ? (
              <td className="px-3 py-2 text-right tabular-nums">
                {data.kpis.netSales.changePct === null
                  ? "—"
                  : `${data.kpis.netSales.changePct > 0 ? "+" : data.kpis.netSales.changePct < 0 ? "−" : ""}${Math.abs(data.kpis.netSales.changePct).toLocaleString("es-AR")} %`}
              </td>
            ) : null}
            <td className="px-3 py-2 text-right tabular-nums">
              {data.kpis.tickets.value}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {data.kpis.averageTicket.value
                ? formatMoneyMinor(data.kpis.averageTicket.value)
                : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {data.kpis.unitsSold.value}
            </td>
            <td className="px-3 py-2 text-right">100</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
