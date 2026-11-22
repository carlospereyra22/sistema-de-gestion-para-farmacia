import { useMemo, type ReactElement } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  FileWarning,
  Handshake,
  PackageOpen,
  PieChart,
  ReceiptText,
  Scale,
  Truck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReportPurchases } from "@gestion/contracts";
import { rankingOption, trendOption } from "./lib/report-charts";
import { donutOption } from "./lib/report-charts-ventas";
import {
  buyVsSellOption,
  calendarOption,
  formatPercent,
  trendUnitOptions,
} from "./lib/report-charts-tabs";
import { reportStatus } from "./lib/report-chart-theme";
import { ReportStat } from "./report-visuals";
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

export function ReportPurchasesTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  return (
    <ReportTabLoader tab="purchases" {...props} active={props.active ?? true}>
      {({ data, animar, onGranularity }) => (
        <ReportPurchasesContent
          data={data}
          comparison={props.view.comparison}
          animar={animar}
          onGranularity={onGranularity}
        />
      )}
    </ReportTabLoader>
  );
}

/** Lo vencido en rojo, lo inmediato en naranja o ámbar y lo lejano en frío. */
const dueColors: Record<string, string> = {
  overdue: reportStatus.bad,
  week: reportStatus.alert,
  "2weeks": reportStatus.warn,
  month: reportStatus.info,
  "2months": reportStatus.new,
  later: "#a855f7",
  undated: reportStatus.neutral,
};

const date = (value: string | null) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T12:00:00` : value,
      ).toLocaleDateString("es-AR")
    : "—";

/**
 * Pestaña Compras y proveedores (SISTEMA-116): qué entró, a quién se le
 * compra, cuánto subieron los costos y qué falta pagar o recibir.
 */
export function ReportPurchasesContent({
  data,
  comparison,
  animar = false,
  onGranularity,
}: {
  data: ReportPurchases;
  comparison: ReportView["comparison"];
  animar?: boolean;
  onGranularity: (unit: ReportPurchases["charts"]["trendUnit"]) => void;
}): ReactElement {
  const { kpis, charts, tables } = data;
  const comparisonLabel =
    comparison === "none"
      ? null
      : (comparisonOptions.find((option) => option.id === comparison)?.label ??
        null);
  const options = useMemo(
    () => ({
      trend: trendOption(charts.trend, charts.trendUnit, comparisonLabel),
      suppliers: rankingOption(
        charts.suppliers.slice(0, 10).map((row) => ({
          name: row.name,
          value: Number(row.value),
          share: row.sharePct,
        })),
        "money",
      ),
      share: donutOption(
        charts.suppliers
          .slice(0, 8)
          .map((row) => ({ name: row.name, value: Number(row.value) })),
      ),
      buyVsSell: buyVsSellOption(charts.buyVsSell, charts.trendUnit),
      calendar: calendarOption(
        charts.duesCalendar.map((row) => ({
          name: row.name,
          value: Number(row.amountMinor),
          color: dueColors[row.id] ?? reportStatus.neutral,
          detail: `${row.invoices} ${row.invoices === 1 ? "factura" : "facturas"}`,
        })),
        "money",
      ),
      increases: rankingOption(
        tables.costIncreases.slice(0, 10).map((row) => ({
          name: row.name,
          value: row.changePct,
        })),
        "percent",
      ),
    }),
    [charts, tables.costIncreases, comparisonLabel],
  );

  const insights: ReportInsightItem[] = [];
  if (charts.suppliers[0])
    insights.push({
      icon: <Handshake size={16} aria-hidden />,
      title: "Proveedor principal",
      value: charts.suppliers[0].name,
      detail: `${formatPercent(charts.suppliers[0].sharePct)} de lo recibido`,
    });
  if (tables.costIncreases[0])
    insights.push({
      icon: <ArrowUpRight size={16} aria-hidden />,
      title: "Mayor aumento de costo",
      value: tables.costIncreases[0].name,
      detail: `+${formatPercent(tables.costIncreases[0].changePct)}: revisá su precio de venta`,
      tone: "bad",
    });
  insights.push({
    icon: <FileWarning size={16} aria-hidden />,
    title: "Deuda vencida con proveedores",
    value: formatMoneyMinor(tables.pendingTotals.overdueMinor),
    detail: `De ${formatMoneyMinor(tables.pendingTotals.balanceMinor)} pendientes`,
    tone: tables.pendingTotals.overdueMinor !== "0" ? "bad" : "good",
  });
  const waiting = tables.pendingReceipts.reduce(
    (sum, row) => sum + BigInt(row.remainingValueMinor),
    0n,
  );
  insights.push({
    icon: <PackageOpen size={16} aria-hidden />,
    title: "Pedido sin recibir",
    value: formatMoneyMinor(waiting.toString()),
    detail: `${tables.pendingReceipts.length.toLocaleString("es-AR")} ${tables.pendingReceipts.length === 1 ? "pedido" : "pedidos"} esperando mercadería`,
  });
  insights.push({
    icon: <ReceiptText size={16} aria-hidden />,
    title: "Facturado por proveedores",
    value: formatMoneyMinor(tables.invoicedMinor),
    detail: "En el período; se informa aparte de lo recibido",
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Compras recibidas"
          icon={<Truck size={18} aria-hidden />}
          kpi={kpis.received}
          higherIsBetter={false}
          help="Mercadería que entró en el período: cantidad recibida por su costo. No incluye pedidos sin recibir ni se suma con lo facturado."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Proveedores activos"
          icon={<Handshake size={18} aria-hidden />}
          kpi={kpis.activeSuppliers}
          help="Proveedores con al menos una recepción o una factura en el período."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Facturas pendientes"
          icon={<Wallet size={18} aria-hidden />}
          kpi={kpis.pendingInvoices}
          higherIsBetter={false}
          help="Facturas de proveedores con saldo por pagar hoy, después de los pagos no anulados."
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label="Variación de costos"
          icon={<TrendingUp size={18} aria-hidden />}
          kpi={kpis.costChange}
          higherIsBetter={false}
          help="Último costo del período contra el último anterior, en productos comprados en los dos, ponderado por lo comprado."
        />
      </div>

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<Truck size={16} aria-hidden />}
        hint="A quién se le compra, qué subió y qué falta pagar o recibir."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <ReportPanel
        animar={animar}
        title="Calendario de pagos a proveedores"
        icon={<CalendarDays size={16} aria-hidden />}
        hint="Saldo de facturas según cuándo vence, contando desde hoy. Para planificar la caja."
      >
        <div className="grid gap-5 xl:grid-cols-[1fr_2.2fr]">
          <div className="grid content-center gap-2.5">
            <ReportStat
              label="A pagar en total"
              value={formatMoneyMinor(tables.pendingTotals.balanceMinor)}
              detail={`${kpis.pendingInvoices.value ?? 0} facturas con saldo`}
            />
            <ReportStat
              label="Ya vencido"
              value={formatMoneyMinor(tables.pendingTotals.overdueMinor)}
              tone={tables.pendingTotals.overdueMinor !== "0" ? "bad" : "good"}
              detail="Pagar primero"
            />
            <ReportStat
              label="Vence esta semana"
              value={formatMoneyMinor(
                charts.duesCalendar.find((row) => row.id === "week")
                  ?.amountMinor ?? "0",
              )}
              detail="Hoy y los próximos 7 días"
            />
          </div>
          <ReportPanelChart
            tipo="barras"
            option={options.calendar}
            label="Calendario de pagos"
            height={250}
          />
        </div>
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Evolución de compras recibidas"
          icon={<TrendingUp size={16} aria-hidden />}
          hint="Por fecha de recepción."
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
            label="Evolución de compras recibidas"
          />
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Participación por proveedor"
          icon={<PieChart size={16} aria-hidden />}
          hint="Sobre lo recibido."
        >
          {charts.suppliers.length ? (
            <ReportPanelChart
              tipo="torta"
              option={options.share}
              label="Participación por proveedor"
              height={240}
            />
          ) : (
            <ReportEmptyState title="Sin recepciones en el período" />
          )}
        </ReportPanel>
      </div>

      <ReportPanel
        animar={animar}
        title="¿Se compra de más o de menos?"
        icon={<Scale size={16} aria-hidden />}
        hint={
          charts.buyVsSell.some((row) => row.soldCostMinor !== null)
            ? "Columnas: lo que entró. Línea: lo que salió vendido, a costo. Si las columnas quedan seguido por encima, el stock crece."
            : "Lo que entró por tramo. Con permiso de costos se compara con lo vendido."
        }
      >
        <ReportPanelChart
          tipo="barras"
          option={options.buyVsSell}
          label="Compras contra lo vendido a costo"
        />
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Compras por proveedor"
          icon={<Handshake size={16} aria-hidden />}
          hint="Recibido y su parte del total."
        >
          {charts.suppliers.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.suppliers}
              label="Compras por proveedor"
              height={Math.max(160, Math.min(10, charts.suppliers.length) * 32)}
            />
          ) : (
            <ReportEmptyState title="Sin recepciones en el período" />
          )}
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Mayores aumentos de costo"
          icon={<ArrowUpRight size={16} aria-hidden />}
          hint="Último costo del período contra el último anterior, por unidad de compra."
        >
          {tables.costIncreases.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.increases}
              label="Mayores aumentos de costo"
              height={Math.max(
                160,
                Math.min(10, tables.costIncreases.length) * 30,
              )}
            />
          ) : (
            <ReportEmptyState title="Sin aumentos de costo en el período" />
          )}
        </ReportPanel>
      </div>

      <ReportPanel
        animar={animar}
        title="Facturas pendientes de pago"
        icon={<FileWarning size={16} aria-hidden />}
        hint="Saldo después de pagos; las más atrasadas primero."
      >
        <ReportTable
          rows={tables.pendingInvoices}
          rowKey={(row) => row.id}
          empty="No hay facturas pendientes."
          minWidth={680}
          columns={[
            { label: "Proveedor", render: (row) => row.supplier },
            {
              label: "Comprobante",
              render: (row) => (
                <span className="text-slate-500">{row.document}</span>
              ),
            },
            {
              label: "Emitida",
              numeric: true,
              render: (row) => date(row.issuedOn),
            },
            { label: "Vence", numeric: true, render: (row) => date(row.dueOn) },
            {
              label: "Saldo",
              numeric: true,
              render: (row) => formatMoneyMinor(row.balanceMinor),
            },
            {
              label: "Mora",
              numeric: true,
              render: (row) =>
                row.daysOverdue ? `${row.daysOverdue} d` : "Al día",
              tone: (row) =>
                row.daysOverdue > 30
                  ? "font-semibold text-rose-600"
                  : row.daysOverdue > 0
                    ? "text-amber-700"
                    : "text-emerald-700",
            },
          ]}
        />
      </ReportPanel>

      <ReportPanel
        animar={animar}
        title="Recepciones pendientes"
        icon={<PackageOpen size={16} aria-hidden />}
        hint="Pedidos hechos y todavía no recibidos (o recibidos en parte)."
      >
        <ReportTable
          rows={tables.pendingReceipts}
          rowKey={(row) => row.purchaseId}
          empty="No hay mercadería pendiente de recibir."
          minWidth={680}
          columns={[
            { label: "Proveedor", render: (row) => row.supplier },
            {
              label: "Referencia",
              render: (row) => (
                <span className="text-slate-500">{row.reference ?? "—"}</span>
              ),
            },
            {
              label: "Pedido",
              numeric: true,
              render: (row) => date(row.orderedAt),
            },
            {
              label: "Pedidas",
              numeric: true,
              render: (row) => row.ordered.toLocaleString("es-AR"),
            },
            {
              label: "Recibidas",
              numeric: true,
              render: (row) => row.received.toLocaleString("es-AR"),
            },
            {
              label: "Faltan",
              numeric: true,
              render: (row) => row.remaining.toLocaleString("es-AR"),
            },
            {
              label: "Valor",
              numeric: true,
              render: (row) => formatMoneyMinor(row.remainingValueMinor),
            },
            {
              label: "Espera",
              numeric: true,
              render: (row) =>
                row.daysWaiting === null ? "—" : `${row.daysWaiting} d`,
              tone: (row) =>
                (row.daysWaiting ?? 0) > 15
                  ? "text-amber-700"
                  : "text-slate-600",
            },
          ]}
        />
      </ReportPanel>
    </div>
  );
}
