import { useMemo, type ReactElement } from "react";
import {
  AlarmClock,
  ArrowRight,
  Boxes,
  CalendarClock,
  Gauge,
  Landmark,
  PackageX,
  PieChart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import type { ReportInventory } from "@gestion/contracts";
import { donutOption } from "./lib/report-charts-ventas";
import {
  calendarOption,
  columnsOption,
  stockTrendOption,
  trendUnitOptions,
} from "./lib/report-charts-tabs";
import { reportStatus } from "./lib/report-chart-theme";
import { ReportStackedBar } from "./report-visuals";
import { formatMoneyMinor } from "./lib/report-format";
import type { ReportView } from "./lib/report-view";
import { Boton } from "./boton";
import { ReportKpiCard } from "./report-kpi";
import {
  ReportInsightList,
  ReportPanel,
  ReportPanelChart,
  ReportSegmented,
  ReportTable,
  ReportWarnings,
  type ReportInsightItem,
} from "./report-panel";
import { ReportEmptyState } from "./report-states";
import { ReportTabLoader } from "./report-tab-loader";

export function ReportInventoryTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
  onOpenInventory: () => void;
}): ReactElement {
  return (
    <ReportTabLoader
      tab="inventory"
      token={props.token}
      organizationId={props.organizationId}
      view={props.view}
      active={props.active ?? true}
    >
      {({ data, animar, onGranularity }) => (
        <ReportInventoryContent
          data={data}
          animar={animar}
          onGranularity={onGranularity}
          onOpenInventory={props.onOpenInventory}
        />
      )}
    </ReportTabLoader>
  );
}

const date = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-AR");

/**
 * Pestaña Inventario (SISTEMA-116): cuánta plata hay en stock, qué se acaba y
 * qué se vence. La evolución se reconstruye con los movimientos.
 */
export function ReportInventoryContent({
  data,
  animar = false,
  onGranularity,
  onOpenInventory,
}: {
  data: ReportInventory;
  animar?: boolean;
  onGranularity: (unit: ReportInventory["charts"]["trendUnit"]) => void;
  /** Abre Inventario para dar de baja, devolver o ajustar. */
  onOpenInventory?: () => void;
}): ReactElement {
  const { kpis, charts, tables, meta } = data;
  const value = tables.showsValue;
  const options = useMemo(
    () => ({
      trend: stockTrendOption(charts.trend, charts.trendUnit, value),
      categories: columnsOption(
        charts.categories.slice(0, 8).map((row) => ({
          name: row.name,
          value: Number(row.value),
        })),
        value ? "money" : "units",
      ),
      expiry: calendarOption(
        charts.expiryByMonth.map((row, index) => ({
          name:
            row.month === "expired"
              ? "Vencido"
              : new Date(`${row.month}-15T12:00:00`).toLocaleDateString(
                  "es-AR",
                  { month: "short", year: "2-digit" },
                ),
          value: value ? Number(row.valueMinor ?? 0) : row.units,
          color:
            row.month === "expired"
              ? reportStatus.worst
              : index === 1
                ? reportStatus.bad
                : index <= 3
                  ? reportStatus.warn
                  : reportStatus.info,
          detail: `${row.lots} ${row.lots === 1 ? "lote" : "lotes"} · ${row.units.toLocaleString("es-AR")} u.`,
        })),
        value ? "money" : "units",
      ),
      share: donutOption(
        charts.categories
          .slice(0, 10)
          .map((row) => ({ name: row.name, value: Number(row.value) })),
      ),
    }),
    [charts, value],
  );
  const expired = tables.expiring.filter((row) => row.daysLeft < 0);
  const soon = tables.expiring.filter((row) => row.daysLeft >= 0);
  const valueOf = (rows: typeof tables.expiring) =>
    rows.reduce((sum, row) => sum + BigInt(row.valueMinor ?? "0"), 0n);
  const first = tables.critical.find((row) => row.coverageDays !== null);
  const startValue = charts.trend[0]?.valueMinor;
  const endValue = charts.trend.at(-1)?.valueMinor;

  const insights: ReportInsightItem[] = [];
  if (first)
    insights.push({
      icon: <AlarmClock size={16} aria-hidden />,
      title: "Lo primero que se acaba",
      value: first.name,
      detail: `Alcanza ${first.coverageDays} ${first.coverageDays === 1 ? "día" : "días"} al ritmo de venta`,
      tone: "bad",
    });
  insights.push({
    icon: <CalendarClock size={16} aria-hidden />,
    title: `Vence en ${tables.expiryWindowDays} días`,
    value: `${soon.length.toLocaleString("es-AR")} lotes`,
    detail: value
      ? `${formatMoneyMinor(valueOf(soon).toString())} a costo`
      : "Con existencia",
    tone: soon.length ? "bad" : "good",
  });
  if (expired.length)
    insights.push({
      icon: <PackageX size={16} aria-hidden />,
      title: "Vencidos con existencia",
      value: `${expired.length.toLocaleString("es-AR")} lotes`,
      detail: value
        ? `${formatMoneyMinor(valueOf(expired).toString())} a dar de baja o devolver`
        : "A dar de baja o devolver",
      tone: "bad",
    });
  if (value && startValue && endValue && startValue !== "0") {
    const change =
      Math.round(
        ((Number(endValue) - Number(startValue)) / Number(startValue)) * 1000,
      ) / 10;
    insights.push({
      icon: <TrendingUp size={16} aria-hidden />,
      title: "Capital en stock en el período",
      value: `${change > 0 ? "+" : ""}${change.toLocaleString("es-AR")} %`,
      detail: `De ${formatMoneyMinor(startValue)} a ${formatMoneyMinor(endValue)}`,
    });
  }
  insights.push({
    icon: <Boxes size={16} aria-hidden />,
    title: "Unidades en stock",
    value: tables.units.sellable.toLocaleString("es-AR"),
    detail: tables.units.expired
      ? `Más ${tables.units.expired.toLocaleString("es-AR")} vencidas`
      : "Vendibles, sin vencidos",
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label={value ? "Valor del stock" : "Unidades en stock"}
          icon={<Landmark size={18} aria-hidden />}
          kpi={kpis.stockValue}
          help={
            value
              ? "Existencias por el costo de su lote. Es valor a costo, no a precio de venta. Incluye vencidos."
              : "Unidades vendibles (sin vencidos) en las sucursales elegidas."
          }
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Stock bajo"
          icon={<Boxes size={18} aria-hidden />}
          kpi={kpis.lowStock}
          higherIsBetter={false}
          help={`Productos con stock vendible entre 1 y ${tables.lowStockThreshold} unidades.`}
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Sin stock"
          icon={<PackageX size={18} aria-hidden />}
          kpi={kpis.outOfStock}
          higherIsBetter={false}
          help="Productos que se vendieron en los últimos 90 días y hoy no tienen stock vendible: ventas que se pierden."
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label={`Lotes por vencer (${tables.expiryWindowDays} días)`}
          icon={<CalendarClock size={18} aria-hidden />}
          kpi={kpis.expiringLots}
          higherIsBetter={false}
          help="Lotes con existencia que vencen dentro de la ventana. Los vencidos van aparte en la tabla."
        />
      </div>
      <ReportWarnings warnings={meta.dataQuality.warnings} />

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<Gauge size={16} aria-hidden />}
        hint="Qué se acaba, qué se vence y cuánta plata hay en góndola."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <ReportPanel
        animar={animar}
        title="Salud del stock"
        icon={<Gauge size={16} aria-hidden />}
        hint="Cada producto con stock en un solo estado, el peor. Y cuánto vence cada mes."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <ReportStackedBar
            label="Productos por estado del stock"
            unit="productos"
            parts={[
              {
                id: "healthy",
                label: "Sanos",
                value: charts.health.healthy,
                color: "bg-emerald-200",
                detail: `Más de ${tables.lowStockThreshold} unidades y sin vencimientos cerca`,
              },
              {
                id: "low",
                label: "Stock bajo",
                value: charts.health.low,
                color: "bg-amber-200",
                detail: `${tables.lowStockThreshold} unidades o menos`,
              },
              {
                id: "expiring",
                label: "Por vencer",
                value: charts.health.expiring,
                color: "bg-orange-200",
                detail: `Algún lote vence en ${tables.expiryWindowDays} días`,
              },
              {
                id: "expired",
                label: "Con vencidos",
                value: charts.health.expired,
                color: "bg-rose-300",
                detail: "Tienen lotes vencidos con existencia",
              },
              {
                id: "out",
                label: "Sin stock",
                value: charts.health.out,
                color: "bg-rose-200",
                detail: "Se vendían y hoy no hay",
              },
            ]}
          />
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700">
              Vencimientos por mes {value ? "(valor a costo)" : "(unidades)"}
            </p>
            <ReportPanelChart
              tipo="barras"
              option={options.expiry}
              label="Vencimientos por mes"
              height={220}
            />
          </div>
        </div>
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title={
            value ? "Evolución del valor del stock" : "Evolución del stock"
          }
          icon={<TrendingUp size={16} aria-hidden />}
          hint="Al cierre de cada tramo, reconstruido con los movimientos de stock (compras, ventas, ajustes y traspasos)."
          action={
            <ReportSegmented
              label="Agrupar por"
              value={charts.trendUnit}
              options={trendUnitOptions}
              onChange={onGranularity}
            />
          }
        >
          <ReportPanelChart
            tipo="linea"
            option={options.trend}
            label="Evolución del stock"
          />
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Capital inmovilizado"
          icon={<PieChart size={16} aria-hidden />}
          hint={
            value ? "Valor a costo por categoría." : "Unidades por categoría."
          }
        >
          {charts.categories.length ? (
            <ReportPanelChart
              tipo="torta"
              option={options.share}
              label="Capital inmovilizado por categoría"
              height={260}
            />
          ) : (
            <ReportEmptyState title="Sin stock" />
          )}
        </ReportPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Stock crítico"
          icon={<AlarmClock size={16} aria-hidden />}
          hint="Cuántos días alcanza el stock con la venta diaria de los últimos 30 días. Para armar el pedido."
        >
          <ReportTable
            rows={tables.critical}
            rowKey={(row) => row.id}
            empty="Ningún producto en riesgo de quedarse sin stock."
            minWidth={440}
            columns={[
              { label: "Producto", render: (row) => row.name },
              {
                label: "Stock",
                numeric: true,
                render: (row) => row.stock.toLocaleString("es-AR"),
              },
              {
                label: "Venta/día",
                numeric: true,
                render: (row) =>
                  row.dailyUnits === null
                    ? "—"
                    : row.dailyUnits.toLocaleString("es-AR"),
              },
              {
                label: "Alcanza",
                numeric: true,
                render: (row) =>
                  row.coverageDays === null
                    ? "Sin ventas"
                    : `${row.coverageDays} d`,
                tone: (row) =>
                  row.coverageDays !== null && row.coverageDays <= 7
                    ? "font-semibold text-rose-600"
                    : "text-amber-700",
              },
            ]}
          />
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Stock por categoría"
          icon={<Warehouse size={16} aria-hidden />}
          hint={value ? "Valor a costo." : "Unidades."}
        >
          {charts.categories.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.categories}
              label="Stock por categoría"
            />
          ) : (
            <ReportEmptyState title="Sin stock" />
          )}
        </ReportPanel>
      </div>

      <ReportPanel
        animar={animar}
        title="Próximos vencimientos"
        icon={<CalendarClock size={16} aria-hidden />}
        hint={`Lotes con existencia: vencidos primero y después los que vencen en ${tables.expiryWindowDays} días.`}
        action={
          onOpenInventory ? (
            <Boton icono={<ArrowRight size={15} />} onClick={onOpenInventory}>
              Ver en Inventario
            </Boton>
          ) : undefined
        }
      >
        <ReportTable
          rows={tables.expiring}
          rowKey={(row) => row.lotId}
          empty="Ningún lote vence en la ventana elegida."
          minWidth={680}
          columns={[
            { label: "Producto", render: (row) => row.product },
            {
              label: "Lote",
              render: (row) => (
                <span className="text-slate-500">{row.lot}</span>
              ),
            },
            {
              label: "Sucursal",
              render: (row) => (
                <span className="text-slate-500">{row.branch}</span>
              ),
            },
            {
              label: "Vence",
              numeric: true,
              render: (row) => date(row.expiresAt),
            },
            {
              label: "Cantidad",
              numeric: true,
              render: (row) => row.quantity.toLocaleString("es-AR"),
            },
            ...(value
              ? [
                  {
                    label: "Valor",
                    numeric: true,
                    render: (
                      row: ReportInventory["tables"]["expiring"][number],
                    ) =>
                      row.valueMinor ? formatMoneyMinor(row.valueMinor) : "—",
                  },
                ]
              : []),
            {
              label: "Días",
              numeric: true,
              render: (row) =>
                row.daysLeft < 0
                  ? `Vencido hace ${-row.daysLeft}`
                  : row.daysLeft === 0
                    ? "Vence hoy"
                    : `${row.daysLeft}`,
              tone: (row) =>
                row.daysLeft <= 0
                  ? "font-semibold text-rose-600"
                  : row.daysLeft <= 30
                    ? "text-amber-700"
                    : "text-slate-600",
            },
          ]}
        />
      </ReportPanel>
    </div>
  );
}
