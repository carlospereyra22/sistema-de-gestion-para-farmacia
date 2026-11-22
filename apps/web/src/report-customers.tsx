import { useMemo, type ReactElement } from "react";
import {
  BookUser,
  CalendarClock,
  Crown,
  HandCoins,
  Hourglass,
  Scale,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { ReportCustomers } from "@gestion/contracts";
import { paymentLabels, rankingOption } from "./lib/report-charts";
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

export function ReportCustomersTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  return (
    <ReportTabLoader tab="customers" {...props} active={props.active ?? true}>
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

const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—";

/**
 * Pestaña Clientes y cuentas corrientes (SISTEMA-116): quién compra, cuánto se
 * fía, cuánto se cobra y quién debe hace más tiempo. Sin DNI, CUIT ni teléfono.
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

  const insights: ReportInsightItem[] = [];
  if (sold > 0n)
    insights.push({
      icon: <Scale size={16} aria-hidden />,
      title: "Cobrado sobre lo vendido a cuenta",
      value: formatPercent(Number((collected * 1000n) / sold) / 10),
      detail:
        collected >= sold
          ? "Se cobró más de lo que se fió: la deuda baja"
          : "Se fió más de lo que se cobró: la deuda sube",
      tone: collected >= sold ? "good" : "bad",
    });
  insights.push({
    icon: <Hourglass size={16} aria-hidden />,
    title: "Deuda vencida",
    value: formatMoneyMinor(overdue.toString()),
    detail: balance
      ? `${formatPercent(Number((overdue * 1000n) / balance) / 10)} del saldo total`
      : "Sin saldo a cobrar",
    tone: overdue > 0n ? "bad" : "good",
  });
  if (tables.debtors[0])
    insights.push({
      icon: <UserRound size={16} aria-hidden />,
      title: "Mayor deudor",
      value: tables.debtors[0].name,
      detail: formatMoneyMinor(tables.debtors[0].balanceMinor),
    });
  if (charts.topCustomers[0])
    insights.push({
      icon: <Crown size={16} aria-hidden />,
      title: "Mejor cliente del período",
      value: charts.topCustomers[0].name,
      detail: `${formatMoneyMinor(charts.topCustomers[0].value)} en ${charts.topCustomers[0].tickets} ${charts.topCustomers[0].tickets === 1 ? "compra" : "compras"}`,
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
          label="Saldo en cuenta corriente"
          icon={<BookUser size={18} aria-hidden />}
          kpi={kpis.accountBalance}
          higherIsBetter={false}
          help="Lo que deben hoy los clientes: débitos menos créditos, sólo los saldos a favor del negocio."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Cobrado en el período"
          icon={<HandCoins size={18} aria-hidden />}
          kpi={kpis.collected}
          help="Cobros de cuenta corriente con medio de pago. Las notas de crédito y anulaciones bajan la deuda pero no son cobros."
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
        icon={<HandCoins size={16} aria-hidden />}
        hint="Cuánto se fía, cuánto se cobra y quién debe."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Vendido a cuenta y cobrado"
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
          hint="Saldo de hoy, cuánto está vencido y hace cuánto pagó por última vez."
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
                render: (row) => dateTime(row.lastPaymentAt),
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
            { label: "Fecha", render: (row) => dateTime(row.createdAt) },
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
    </div>
  );
}
