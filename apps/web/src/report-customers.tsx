import { useMemo, type ReactElement } from "react";
import {
  BookUser,
  CalendarClock,
  CalendarRange,
  Crown,
  HandCoins,
  HeartHandshake,
  Info,
  Repeat,
  Scale,
  UserRound,
  UserRoundSearch,
  Users,
  Wallet,
} from "lucide-react";
import type { ReportCustomers, ReportLoyaltySegment } from "@gestion/contracts";
import { paymentLabels, rankingOption } from "./lib/report-charts";
import {
  accountTrendOption,
  agingOption,
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
import { ReportEmptyState } from "./report-states";
import { ReportTabLoader } from "./report-tab-loader";
import {
  ReportChip,
  ReportCohortTable,
  ReportHero,
  ReportRing,
  ReportSection,
  ReportStackedBar,
  ReportStat,
} from "./report-visuals";

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

const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—";

/** Nombre, color y explicación de cada segmento de fidelidad. */
const segmentInfo: Record<
  ReportLoyaltySegment,
  { label: string; color: string; text: string; tone: string }
> = {
  frequent: {
    label: "Frecuentes",
    color: "bg-teal-600",
    text: "4 o más compras, cada 30 días o menos",
    tone: "bg-teal-50 text-teal-800",
  },
  regular: {
    label: "Regulares",
    color: "bg-sky-500",
    text: "Vuelven a su ritmo",
    tone: "bg-sky-50 text-sky-800",
  },
  new: {
    label: "Nuevos",
    color: "bg-indigo-500",
    text: "Primera compra en el período",
    tone: "bg-indigo-50 text-indigo-800",
  },
  atRisk: {
    label: "En riesgo",
    color: "bg-amber-500",
    text: "Pasaron 1,5 veces su frecuencia sin volver",
    tone: "bg-amber-50 text-amber-800",
  },
  lost: {
    label: "Perdidos",
    color: "bg-rose-500",
    text: "Más de 120 días sin comprar",
    tone: "bg-rose-50 text-rose-800",
  },
};

/**
 * Pestaña Clientes (SISTEMA-116, rediseñada en SISTEMA-117): primero la
 * fidelidad (si el cliente vuelve, cada cuánto y a quién recuperar) y después
 * la cuenta corriente. Sin DNI, CUIT ni teléfono.
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
      trend: accountTrendOption(
        charts.trend,
        charts.trendUnit,
        comparisonLabel,
      ),
      top: rankingOption(
        charts.topCustomers.map((row) => ({
          name: row.name,
          value: Number(row.value),
          share: row.sharePct,
        })),
        "money",
      ),
      aging: agingOption(charts.aging),
    }),
    [charts, loyalty, comparisonLabel],
  );
  const identified = loyalty.identifiedSharePct;
  const customersTotal = loyalty.segments.reduce(
    (sum, segment) => sum + segment.customers,
    0,
  );

  // Cuenta corriente.
  const sold = charts.trend.reduce(
    (sum, row) => sum + BigInt(row.soldOnAccountMinor),
    0n,
  );
  const collected = charts.trend.reduce(
    (sum, row) => sum + BigInt(row.collectedMinor),
    0n,
  );
  const overdue = charts.aging
    .filter((row) => row.id !== "current" && row.id !== "undated")
    .reduce((sum, row) => sum + BigInt(row.value), 0n);
  const balance = BigInt(kpis.accountBalance.value ?? "0");
  const accountInsights: ReportInsightItem[] = [];
  if (sold > 0n)
    accountInsights.push({
      icon: <Scale size={16} aria-hidden />,
      title: "Cobrado sobre lo fiado",
      value: formatPercent(Number((collected * 1000n) / sold) / 10),
      detail:
        collected >= sold
          ? "Se cobró más de lo que se fió: la deuda baja"
          : "Se fió más de lo que se cobró: la deuda sube",
      tone: collected >= sold ? "good" : "bad",
    });
  accountInsights.push({
    icon: <CalendarClock size={16} aria-hidden />,
    title: "Deuda vencida",
    value: formatMoneyMinor(overdue.toString()),
    detail: balance
      ? `${formatPercent(Number((overdue * 1000n) / balance) / 10)} del saldo`
      : "Sin saldo a cobrar",
    tone: overdue > 0n ? "bad" : "good",
  });
  if (tables.debtors[0])
    accountInsights.push({
      icon: <UserRound size={16} aria-hidden />,
      title: "Mayor deudor",
      value: tables.debtors[0].name,
      detail: formatMoneyMinor(tables.debtors[0].balanceMinor),
    });

  return (
    <div className="space-y-8">
      <ReportSection
        icon={<HeartHandshake size={18} aria-hidden />}
        title="Fidelidad"
        description="Si el cliente vuelve, cada cuánto y a quién conviene recuperar."
        badge={
          <ReportChip
            tone={identified !== null && identified < 50 ? "warn" : "neutral"}
          >
            <Info size={13} aria-hidden />
            {identified === null
              ? "Sin ventas en el período"
              : `${formatPercent(identified)} de lo facturado tiene cliente identificado`}
          </ReportChip>
        }
      >
        {customersTotal ? (
          <>
            <ReportHero animar={animar}>
              <div className="grid gap-6 lg:grid-cols-[auto_1fr] xl:grid-cols-[auto_1.1fr_1fr]">
                <div className="flex flex-col items-center justify-center gap-1">
                  <ReportRing
                    value={loyalty.returningPct}
                    color="text-teal-600"
                    label="de los clientes del período ya habían comprado"
                    animar={animar}
                    size={150}
                  />
                  <p className="text-xs text-slate-500">
                    {loyalty.returningCustomers} volvieron ·{" "}
                    {loyalty.newCustomers} nuevos
                  </p>
                </div>
                <div className="grid content-center gap-2.5 sm:grid-cols-2">
                  <ReportStat
                    label="Retención"
                    value={formatPercent(loyalty.retentionPct)}
                    detail={
                      comparisonLabel
                        ? `De los clientes del ${comparisonLabel.toLowerCase()}, volvieron`
                        : "Elegí una comparación para verla"
                    }
                    tone={
                      loyalty.retentionPct === null
                        ? "neutral"
                        : loyalty.retentionPct >= 50
                          ? "good"
                          : "bad"
                    }
                  />
                  <ReportStat
                    label="Compran cada"
                    value={
                      loyalty.medianDaysBetween === null
                        ? "—"
                        : `${loyalty.medianDaysBetween} días`
                    }
                    detail="Mediana entre compras de quienes volvieron"
                  />
                  <ReportStat
                    label="Compras por cliente"
                    value={
                      loyalty.purchasesPerCustomer?.toLocaleString("es-AR") ??
                      "—"
                    }
                    detail="En el período"
                  />
                  <ReportStat
                    label="Gasto por cliente"
                    value={
                      loyalty.spendPerCustomerMinor
                        ? formatMoneyMinor(loyalty.spendPerCustomerMinor)
                        : "—"
                    }
                    detail="Facturado promedio en el período"
                  />
                </div>
                <div className="lg:col-span-2 xl:col-span-1">
                  <p className="mb-3 text-sm font-semibold text-slate-800">
                    {customersTotal.toLocaleString("es-AR")} clientes por estado
                  </p>
                  <ReportStackedBar
                    label="Clientes por estado"
                    unit="clientes"
                    parts={loyalty.segments.map((segment) => ({
                      id: segment.id,
                      label: segmentInfo[segment.id].label,
                      value: segment.customers,
                      color: segmentInfo[segment.id].color,
                      detail: `${segmentInfo[segment.id].text} · ${formatMoneyMinor(segment.lifetimeMinor)} históricos`,
                    }))}
                  />
                </div>
              </div>
            </ReportHero>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <ReportPanel
                animar={animar}
                orden={0}
                title="Nuevos y los que vuelven"
                icon={<Repeat size={16} aria-hidden />}
                hint="Clientes distintos por tramo. Que crezca el verde es buena señal: la gente vuelve."
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
                hint="Promedio de días entre compras de cada cliente."
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
                title="Cohortes: ¿vuelven los que llegan?"
                icon={<Users size={16} aria-hidden />}
                hint="Por mes de primera compra: qué parte volvió a comprar cada mes siguiente. Más oscuro, más vuelven."
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
                          ? "1 compra"
                          : `cada ${row.usualDays} d`,
                    },
                    {
                      label: "Compró",
                      numeric: true,
                      render: (row) => formatMoneyMinor(row.lifetimeMinor),
                    },
                  ]}
                />
              </ReportPanel>
            </div>
          </>
        ) : (
          <ReportHero animar={animar}>
            <ReportEmptyState
              title="Todavía no hay ventas con cliente identificado"
              description="Cargá el cliente al vender (aunque sea de contado) para medir quién vuelve y cada cuánto."
            />
          </ReportHero>
        )}
      </ReportSection>

      <ReportSection
        icon={<BookUser size={18} aria-hidden />}
        title="Cuenta corriente"
        description="Cuánto se fía, cuánto se cobra y quién debe."
      >
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
            label="Saldo a cobrar"
            icon={<BookUser size={18} aria-hidden />}
            kpi={kpis.accountBalance}
            higherIsBetter={false}
            help="Lo que deben hoy los clientes: débitos menos créditos."
          />
          <ReportKpiCard
            animar={animar}
            orden={2}
            label="Cobrado en el período"
            icon={<HandCoins size={18} aria-hidden />}
            kpi={kpis.collected}
            help="Cobros de cuenta corriente con medio de pago. Las notas de crédito bajan la deuda pero no son cobros."
          />
          <ReportKpiCard
            animar={animar}
            orden={3}
            label="Clientes con deuda"
            icon={<Wallet size={18} aria-hidden />}
            kpi={kpis.debtors}
            higherIsBetter={false}
            help="Clientes con saldo a cobrar hoy."
          />
        </div>
        <ReportInsightList items={accountInsights} />
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <ReportPanel
            animar={animar}
            orden={0}
            title="Fiado y cobrado"
            icon={<Scale size={16} aria-hidden />}
            hint="Columnas: lo que se fió. Línea: lo que se cobró. Si la línea queda abajo, la deuda crece."
          >
            <ReportPanelChart
              tipo="barras"
              option={options.trend}
              label="Vendido a cuenta y cobrado"
            />
          </ReportPanel>
          <ReportPanel
            animar={animar}
            orden={1}
            title="Antigüedad de saldos"
            icon={<CalendarClock size={16} aria-hidden />}
            hint="Según el vencimiento de cada venta a cuenta; lo cobrado salda primero lo más viejo."
          >
            {balance > 0n ? (
              <ReportPanelChart
                tipo="barras"
                option={options.aging}
                label="Antigüedad de saldos"
              />
            ) : (
              <ReportEmptyState title="Ningún cliente debe" />
            )}
          </ReportPanel>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <ReportPanel
            animar={animar}
            orden={0}
            title="Mejores clientes"
            icon={<Crown size={16} aria-hidden />}
            hint="Facturado en el período (no suma cobros)."
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
          <ReportPanel
            animar={animar}
            orden={1}
            title="Clientes con mayor deuda"
            icon={<UserRound size={16} aria-hidden />}
            hint="Saldo de hoy, cuánto está vencido y cuándo pagó por última vez."
          >
            <ReportTable
              rows={tables.debtors}
              rowKey={(row) => row.id}
              empty="Ningún cliente debe."
              minWidth={560}
              columns={[
                { label: "Cliente", render: (row) => row.name },
                {
                  label: "Saldo",
                  numeric: true,
                  render: (row) => formatMoneyMinor(row.balanceMinor),
                },
                {
                  label: "Vencido",
                  numeric: true,
                  render: (row) => formatMoneyMinor(row.overdueMinor),
                  tone: (row) =>
                    row.overdueMinor !== "0"
                      ? "text-rose-600"
                      : "text-slate-400",
                },
                {
                  label: "Atraso",
                  numeric: true,
                  render: (row) =>
                    row.oldestDaysOverdue ? `${row.oldestDaysOverdue} d` : "—",
                },
                {
                  label: "Último pago",
                  numeric: true,
                  render: (row) => day(row.lastPaymentAt),
                },
              ]}
            />
          </ReportPanel>
        </div>
        <ReportPanel
          animar={animar}
          title="Últimos cobros"
          icon={<HandCoins size={16} aria-hidden />}
          hint="Cobros de cuenta corriente del período, los más recientes primero."
        >
          <ReportTable
            rows={tables.collections}
            rowKey={(row) => row.id}
            empty="Sin cobros en el período."
            minWidth={560}
            columns={[
              { label: "Fecha", render: (row) => day(row.createdAt) },
              { label: "Cliente", render: (row) => row.customer },
              {
                label: "Sucursal",
                render: (row) => (
                  <span className="text-slate-500">{row.branch}</span>
                ),
              },
              {
                label: "Medio",
                render: (row) => paymentLabels[row.method] ?? row.method,
              },
              {
                label: "Importe",
                numeric: true,
                render: (row) => formatMoneyMinor(row.amountMinor),
              },
            ]}
          />
        </ReportPanel>
      </ReportSection>
    </div>
  );
}
