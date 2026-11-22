import { useMemo, type ReactElement } from "react";
import {
  BookUser,
  CalendarClock,
  HandCoins,
  Hourglass,
  Scale,
  UserRound,
  Wallet,
} from "lucide-react";
import type { ReportCustomers, ReportKpi } from "@gestion/contracts";
import { paymentLabels } from "./lib/report-charts";
import {
  accountTrendOption,
  agingOption,
  formatPercent,
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

/**
 * Pestaña Cuentas corrientes (SISTEMA-118, pedido del usuario: apartado
 * propio). Usa los mismos datos de `reports/customers`: lo que se fía, lo que
 * se cobra, la antigüedad de la deuda y quién debe.
 */
export function ReportAccountsTab(props: {
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
        <ReportAccountsContent
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

export function ReportAccountsContent({
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
  const comparisonLabel =
    comparison === "none"
      ? null
      : (comparisonOptions.find((option) => option.id === comparison)?.label ??
        null);
  const options = useMemo(
    () => ({
      trend: accountTrendOption(
        charts.trend,
        charts.trendUnit,
        comparisonLabel,
      ),
      aging: agingOption(charts.aging),
    }),
    [charts, comparisonLabel],
  );
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
  const overdueKpi: ReportKpi = {
    unit: "money",
    available: true,
    value: overdue.toString(),
    previous: null,
    changePct: null,
  };

  const insights: ReportInsightItem[] = [];
  if (sold > 0n)
    insights.push({
      icon: <Scale size={16} aria-hidden />,
      title: "Cobrado sobre lo fiado",
      value: formatPercent(Number((collected * 1000n) / sold) / 10),
      detail:
        collected >= sold
          ? "Se cobró más de lo que se fió: la deuda baja"
          : "Se fió más de lo que se cobró: la deuda sube",
      tone: collected >= sold ? "good" : "bad",
    });
  insights.push({
    icon: <Hourglass size={16} aria-hidden />,
    title: "Parte vencida del saldo",
    value: balance
      ? formatPercent(Number((overdue * 1000n) / balance) / 10)
      : "—",
    detail: balance
      ? formatMoneyMinor(overdue.toString())
      : "Sin saldo a cobrar",
    tone: overdue > 0n ? "bad" : "good",
  });
  if (tables.debtors[0])
    insights.push({
      icon: <UserRound size={16} aria-hidden />,
      title: "Mayor deudor",
      value: tables.debtors[0].name,
      detail: `${formatMoneyMinor(tables.debtors[0].balanceMinor)}${balance ? ` · ${formatPercent(Number((BigInt(tables.debtors[0].balanceMinor) * 1000n) / balance) / 10)} del saldo` : ""}`,
    });
  const oldest = [...tables.debtors].sort(
    (left, right) => right.oldestDaysOverdue - left.oldestDaysOverdue,
  )[0];
  if (oldest?.oldestDaysOverdue)
    insights.push({
      icon: <CalendarClock size={16} aria-hidden />,
      title: "Deuda más atrasada",
      value: oldest.name,
      detail: `${oldest.oldestDaysOverdue} días de atraso`,
      tone: "bad",
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Saldo a cobrar"
          icon={<BookUser size={18} aria-hidden />}
          kpi={kpis.accountBalance}
          higherIsBetter={false}
          help="Lo que deben hoy los clientes: débitos menos créditos."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Deuda vencida"
          icon={<Hourglass size={18} aria-hidden />}
          kpi={overdueKpi}
          higherIsBetter={false}
          help="La parte del saldo cuyas ventas ya vencieron, según el plazo de cada venta."
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

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<BookUser size={16} aria-hidden />}
        hint="Cuánto se fía, cuánto se cobra y quién debe."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Fiado y cobrado"
          icon={<Scale size={16} aria-hidden />}
          hint="Columnas: lo que se fió. Línea: lo que se cobró. Si la línea queda abajo, la deuda crece."
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
            option={options.trend}
            label="Vendido a cuenta y cobrado"
          />
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Antigüedad de la deuda"
          icon={<CalendarClock size={16} aria-hidden />}
          hint="Según el vencimiento de cada venta a cuenta; lo cobrado salda primero lo más viejo."
        >
          {balance > 0n ? (
            <ReportPanelChart
              tipo="barras"
              option={options.aging}
              label="Antigüedad de la deuda"
            />
          ) : (
            <ReportEmptyState title="Ningún cliente debe" />
          )}
        </ReportPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
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
                  row.overdueMinor !== "0" ? "text-rose-600" : "text-slate-400",
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
        <ReportPanel
          animar={animar}
          orden={1}
          title="Últimos cobros"
          icon={<HandCoins size={16} aria-hidden />}
          hint="Los más recientes del período."
        >
          <ReportTable
            rows={tables.collections}
            rowKey={(row) => row.id}
            empty="Sin cobros en el período."
            minWidth={420}
            columns={[
              { label: "Fecha", render: (row) => day(row.createdAt) },
              { label: "Cliente", render: (row) => row.customer },
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
      </div>
    </div>
  );
}
