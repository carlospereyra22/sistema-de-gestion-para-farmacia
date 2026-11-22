import { useMemo, type ReactElement } from "react";
import {
  CalendarRange,
  Crown,
  HeartHandshake,
  Repeat,
  UserCheck,
  UserPlus,
  UserRoundSearch,
  Users,
} from "lucide-react";
import type {
  ReportCustomers,
  ReportKpi,
  ReportLoyaltySegment,
} from "@gestion/contracts";
import { rankingOption } from "./lib/report-charts";
import { reportStatus } from "./lib/report-chart-theme";
import {
  formatPercent,
  frequencyOption,
  newVsReturningOption,
  trendUnitOptions,
} from "./lib/report-charts-tabs";
import { formatMoneyMinor } from "./lib/report-format";
import { comparisonOptions, type ReportView } from "./lib/report-view";
import { ReportKpiCard } from "./report-kpi";
import {
  ReportInsightList,
  ReportPanel,
  ReportPanelChart,
  ReportSegmented,
  ReportTable,
  type ReportInsightItem,
} from "./report-panel";
import { ReportEmptyState, reportCardClass } from "./report-states";
import { ReportTabLoader } from "./report-tab-loader";
import { ReportCohortTable, ReportStackedBar } from "./report-visuals";

export function ReportCustomersTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  return (
    <ReportTabLoader
      tab="customers"
      token={props.token}
      organizationId={props.organizationId}
      view={props.view}
      active={props.active ?? true}
    >
      {({ data, animar, onGranularity }) => (
        <ReportCustomersContent
          data={data}
          comparison={props.view.comparison}
          animar={animar}
          onGranularity={onGranularity}
        />
      )}
    </ReportTabLoader>
  );
}

/** Nombre, color (pastel) y explicación de cada segmento de fidelidad. */
const segmentInfo: Record<
  ReportLoyaltySegment,
  { label: string; color: string; text: string; tone: string }
> = {
  frequent: {
    label: "Frecuentes",
    color: reportStatus.good,
    text: "4 o más visitas, cada 30 días o menos",
    tone: "bg-teal-50 text-teal-800",
  },
  regular: {
    label: "Regulares",
    color: reportStatus.info,
    text: "Vuelven a su ritmo",
    tone: "bg-sky-50 text-sky-800",
  },
  new: {
    label: "Nuevos",
    color: reportStatus.new,
    text: "Primera compra en el período",
    tone: "bg-indigo-50 text-indigo-800",
  },
  atRisk: {
    label: "En riesgo",
    color: reportStatus.warn,
    text: "Pasaron 1,5 veces su frecuencia sin volver",
    tone: "bg-amber-50 text-amber-800",
  },
  lost: {
    label: "Perdidos",
    color: reportStatus.bad,
    text: "Más de 120 días sin comprar",
    tone: "bg-rose-50 text-rose-800",
  },
};

/** Indicador sin comparación armado en la pantalla (porcentajes, días). */
const plainKpi = (
  unit: ReportKpi["unit"],
  value: number | null,
): ReportKpi => ({
  unit,
  available: value !== null,
  ...(value === null ? { unavailableReason: "NO_DATA" as const } : {}),
  value: value === null ? null : String(value),
  previous: null,
  changePct: null,
});

/**
 * Pestaña Clientes (SISTEMA-117/118): fidelidad. Si el cliente vuelve, cada
 * cuánto, quién está por perderse y quiénes son los mejores. La cuenta
 * corriente tiene su propia pestaña. Sólo ventas con cliente identificado.
 */
export function ReportCustomersContent({
  data,
  comparison,
  animar = false,
  onGranularity,
}: {
  data: ReportCustomers;
  comparison: ReportView["comparison"];
  animar?: boolean;
  onGranularity: (unit: ReportCustomers["charts"]["trendUnit"]) => void;
}): ReactElement {
  const { kpis, charts, tables } = data;
  const loyalty = tables.loyalty;
  const comparisonLabel =
    comparison === "none"
      ? null
      : (comparisonOptions.find((option) => option.id === comparison)?.label ??
        null);
  const options = useMemo(
    () => ({
      newVsReturning: newVsReturningOption(
        loyalty.newVsReturning,
        charts.trendUnit,
      ),
      frequency: frequencyOption(loyalty.frequency),
      top: rankingOption(
        charts.topCustomers.map((row) => ({
          name: row.name,
          value: Number(row.value),
          share: row.sharePct,
        })),
        "money",
      ),
    }),
    [charts, loyalty],
  );
  const customersTotal = loyalty.segments.reduce(
    (sum, segment) => sum + segment.customers,
    0,
  );
  const segment = (id: ReportLoyaltySegment) =>
    loyalty.segments.find((row) => row.id === id);
  const atRisk =
    (segment("atRisk")?.customers ?? 0) + (segment("lost")?.customers ?? 0);
  const fewIdentified =
    loyalty.identifiedSharePct !== null && loyalty.identifiedSharePct < 50;

  const insights: ReportInsightItem[] = [
    {
      icon: <Users size={16} aria-hidden />,
      title: "Ventas con cliente identificado",
      value: formatPercent(loyalty.identifiedSharePct),
      detail: fewIdentified
        ? "Cargá el cliente al vender para medir mejor"
        : "Del total facturado del período",
      tone: fewIdentified ? "bad" : "good",
    },
    {
      icon: <UserPlus size={16} aria-hidden />,
      title: "Clientes nuevos",
      value: loyalty.newCustomers.toLocaleString("es-AR"),
      detail: `${loyalty.returningCustomers.toLocaleString("es-AR")} ya habían comprado antes`,
    },
    {
      icon: <UserRoundSearch size={16} aria-hidden />,
      title: "Para recuperar",
      value: `${atRisk.toLocaleString("es-AR")} clientes`,
      detail: atRisk
        ? "En riesgo o perdidos: abajo, la lista"
        : "Todos vuelven a su ritmo",
      tone: atRisk ? "bad" : "good",
    },
  ];
  if (charts.topCustomers[0])
    insights.push({
      icon: <Crown size={16} aria-hidden />,
      title: "Mejor cliente del período",
      value: charts.topCustomers[0].name,
      detail: `${formatMoneyMinor(charts.topCustomers[0].value)} en ${charts.topCustomers[0].tickets} ${charts.topCustomers[0].tickets === 1 ? "compra" : "compras"}`,
    });
  if (loyalty.spendPerCustomerMinor)
    insights.push({
      icon: <UserCheck size={16} aria-hidden />,
      title: "Gasto por cliente",
      value: formatMoneyMinor(loyalty.spendPerCustomerMinor),
      detail: `${loyalty.purchasesPerCustomer?.toLocaleString("es-AR") ?? "—"} compras promedio en el período`,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Clientes con compras"
          icon={<Users size={18} aria-hidden />}
          kpi={kpis.activeCustomers}
          help="Clientes identificados en al menos una venta confirmada del período."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Recompra"
          icon={<Repeat size={18} aria-hidden />}
          kpi={plainKpi("percent", loyalty.returningPct)}
          help="De los clientes que compraron en el período, qué parte ya había comprado antes."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Retención"
          icon={<HeartHandshake size={18} aria-hidden />}
          kpi={plainKpi("percent", loyalty.retentionPct)}
          help={
            comparisonLabel
              ? `De los clientes del ${comparisonLabel.toLowerCase()}, qué parte volvió a comprar en este período.`
              : "Elegí una comparación para medir cuántos clientes volvieron."
          }
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label="Compran cada (días)"
          icon={<CalendarRange size={18} aria-hidden />}
          kpi={plainKpi("count", loyalty.medianDaysBetween)}
          help="Mediana de días entre visitas de los clientes que compraron más de una vez. Dos tickets el mismo día son una visita."
        />
      </div>

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<HeartHandshake size={16} aria-hidden />}
        hint="Si el cliente vuelve, cada cuánto y a quién conviene llamar."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      {customersTotal ? (
        <>
          <ReportPanel
            animar={animar}
            title="Clientes por estado"
            icon={<Users size={16} aria-hidden />}
            hint="Cada cliente según su última compra y su propio ritmo: el que viene cada semana se marca en riesgo antes que el que viene cada dos meses."
          >
            <ReportStackedBar
              label="Clientes por estado"
              unit="clientes"
              parts={loyalty.segments.map((row) => ({
                id: row.id,
                label: segmentInfo[row.id].label,
                value: row.customers,
                color: segmentInfo[row.id].color,
                detail: `${segmentInfo[row.id].text} · ${formatMoneyMinor(row.lifetimeMinor)} comprados en total`,
              }))}
            />
          </ReportPanel>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <ReportPanel
              animar={animar}
              orden={0}
              title="Nuevos y los que vuelven"
              icon={<Repeat size={16} aria-hidden />}
              hint="Clientes distintos por tramo. Que crezca la parte de los que vuelven es buena señal."
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
                tipo="barras"
                option={options.newVsReturning}
                label="Clientes nuevos y recurrentes"
              />
            </ReportPanel>
            <ReportPanel
              animar={animar}
              orden={1}
              title="Cada cuánto compran"
              icon={<CalendarRange size={16} aria-hidden />}
              hint="Promedio de días entre visitas de cada cliente."
            >
              <ReportPanelChart
                tipo="barras"
                option={options.frequency}
                label="Frecuencia de compra"
              />
            </ReportPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <ReportPanel
              animar={animar}
              orden={0}
              title="¿Vuelven los que llegan?"
              icon={<Users size={16} aria-hidden />}
              hint="Cada fila, los clientes que compraron por primera vez ese mes. Cada columna, qué parte volvió a comprar en los meses siguientes."
            >
              {loyalty.cohorts.length ? (
                <ReportCohortTable cohorts={loyalty.cohorts} />
              ) : (
                <ReportEmptyState title="Sin clientes nuevos en los últimos 6 meses" />
              )}
            </ReportPanel>
            <ReportPanel
              animar={animar}
              orden={1}
              title="Clientes para recuperar"
              icon={<UserRoundSearch size={16} aria-hidden />}
              hint="Los que más compraban y dejaron de venir, primero. Un llamado o una oferta a tiempo."
            >
              <ReportTable
                rows={loyalty.toRecover}
                rowKey={(row) => row.id}
                empty="Nadie para recuperar: todos vuelven a su ritmo."
                minWidth={520}
                columns={[
                  { label: "Cliente", render: (row) => row.name },
                  {
                    label: "Estado",
                    render: (row) => (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${segmentInfo[row.segment].tone}`}
                      >
                        {segmentInfo[row.segment].label}
                      </span>
                    ),
                  },
                  {
                    label: "Sin venir",
                    numeric: true,
                    render: (row) => `${row.daysSince} d`,
                  },
                  {
                    label: "Solía venir",
                    numeric: true,
                    render: (row) =>
                      row.usualDays === null
                        ? "Una vez"
                        : `cada ${row.usualDays} d`,
                  },
                  {
                    label: "Compró en total",
                    numeric: true,
                    render: (row) => formatMoneyMinor(row.lifetimeMinor),
                  },
                ]}
              />
            </ReportPanel>
          </div>

          <ReportPanel
            animar={animar}
            title="Mejores clientes"
            icon={<Crown size={16} aria-hidden />}
            hint="Facturado en el período y su parte del total de estos clientes."
          >
            {charts.topCustomers.length ? (
              <ReportPanelChart
                tipo="barras"
                option={options.top}
                label="Mejores clientes"
                height={Math.max(160, charts.topCustomers.length * 30)}
              />
            ) : (
              <ReportEmptyState title="Sin ventas a clientes identificados" />
            )}
          </ReportPanel>
        </>
      ) : (
        <div className={reportCardClass}>
          <ReportEmptyState
            title="Todavía no hay ventas con cliente identificado"
            description="Cargá el cliente al vender (aunque sea de contado) para medir quién vuelve y cada cuánto."
          />
        </div>
      )}
    </div>
  );
}
