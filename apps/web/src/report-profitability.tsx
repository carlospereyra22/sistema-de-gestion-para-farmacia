import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  AlertTriangle,
  Info,
  BadgeDollarSign,
  Coins,
  Percent,
  ReceiptText,
  Store,
  Tags,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ReportProfitability, ReportProfitRow } from "@gestion/contracts";
import { rankingOption } from "./lib/report-charts";
import { reportStatus } from "./lib/report-chart-theme";
import { donutOption } from "./lib/report-charts-ventas";
import {
  columnsOption,
  divergingOption,
  formatPercent,
  formatPp,
  profitTrendOption,
  trendUnitOptions,
} from "./lib/report-charts-tabs";
import { ReportStat } from "./report-visuals";
import { formatMoneyMinor } from "./lib/report-format";
import type { ReportView } from "./lib/report-view";
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
import { ReportEmptyState, reportCardClass } from "./report-states";
import { ReportTabLoader } from "./report-tab-loader";

export function ReportProfitabilityTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  return (
    <ReportTabLoader
      tab="profitability"
      {...props}
      active={props.active ?? true}
    >
      {({ data, animar, onGranularity }) => (
        <ReportProfitabilityContent
          data={data}
          animar={animar}
          onGranularity={onGranularity}
        />
      )}
    </ReportTabLoader>
  );
}

const money = (value: string) => formatMoneyMinor(value);

/**
 * Pestaña Rentabilidad (SISTEMA-116): cuánto se gana, con qué margen y en qué.
 * Todo es estimado con el costo de lote; no es ganancia neta.
 */
export function ReportProfitabilityContent({
  data,
  animar = false,
  onGranularity,
}: {
  data: ReportProfitability;
  animar?: boolean;
  onGranularity: (unit: ReportProfitability["charts"]["trendUnit"]) => void;
}): ReactElement {
  const { kpis, charts, tables, meta } = data;
  const [ranking, setRanking] = useState<"profit" | "margin">("profit");
  const severalBranches = tables.branches.length > 1;
  const options = useMemo(() => {
    // Por margen sólo productos con algo de volumen: una venta suelta con
    // margen alto no es un producto rentable.
    const products = [...charts.products]
      .filter((row) => ranking === "profit" || row.units >= 3)
      .sort((left, right) =>
        ranking === "margin"
          ? (right.marginPct ?? 0) - (left.marginPct ?? 0)
          : Number(BigInt(right.profitMinor) - BigInt(left.profitMinor)),
      )
      .slice(0, 10);
    return {
      trend: profitTrendOption(charts.trend, charts.trendUnit),
      changes: divergingOption(
        charts.profitChanges.map((row) => ({
          name: row.name,
          value: Number(row.changeMinor),
          detail: `Antes ${formatMoneyMinor(row.previousProfitMinor)} · ahora ${formatMoneyMinor(row.profitMinor)}`,
        })),
        "money",
      ),
      products: rankingOption(
        products.map((row) => ({
          name: `${row.name} (${row.units} u.)`,
          value:
            ranking === "margin"
              ? (row.marginPct ?? 0)
              : Number(row.profitMinor),
        })),
        ranking === "margin" ? "percent" : "money",
      ),
      categories: columnsOption(
        charts.categories.slice(0, 8).map((row) => ({
          name: row.name,
          value: row.marginPct ?? 0,
          label: formatPercent(row.marginPct),
        })),
        "percent",
      ),
      branches: donutOption(
        tables.branches.map((row) => ({
          name: row.name,
          value: Math.max(0, Number(row.profitMinor)),
        })),
      ),
    };
  }, [charts, tables.branches, ranking]);

  // Ventas con costo = suma de las categorías (sólo líneas con lote).
  const salesWithCost = charts.categories
    .reduce((sum, row) => sum + BigInt(row.netSalesMinor), 0n)
    .toString();
  const salesWithoutCost =
    tables.costCoveragePct && tables.costCoveragePct < 100
      ? (
          (BigInt(salesWithCost) * 1000n) /
            BigInt(Math.round(tables.costCoveragePct * 10)) -
          BigInt(salesWithCost)
        ).toString()
      : "0";
  const best = charts.products[0];
  const worstCategory = [...charts.categories]
    .filter((row) => row.marginPct !== null)
    .sort((left, right) => left.marginPct! - right.marginPct!)[0];
  const insights: ReportInsightItem[] = [];
  if (best)
    insights.push({
      icon: <Trophy size={16} aria-hidden />,
      title: "Producto que más ganancia deja",
      value: best.name,
      detail: `${money(best.profitMinor)} · margen ${formatPercent(best.marginPct)}`,
    });
  if (charts.categories[0])
    insights.push({
      icon: <Tags size={16} aria-hidden />,
      title: "Categoría más rentable",
      value: charts.categories[0].name,
      detail: `${money(charts.categories[0].profitMinor)} de ganancia`,
    });
  if (worstCategory && worstCategory !== charts.categories[0])
    insights.push({
      icon: <TrendingDown size={16} aria-hidden />,
      title: "Categoría con menor margen",
      value: worstCategory.name,
      detail: `Margen ${formatPercent(worstCategory.marginPct)}`,
      tone: "bad",
    });
  insights.push({
    icon: <AlertTriangle size={16} aria-hidden />,
    title: `Productos bajo ${tables.marginTargetPct} % de margen`,
    value: tables.lowMargin.length.toLocaleString("es-AR"),
    detail: tables.lowMargin.length
      ? "Revisá su precio o su costo"
      : "Ninguno por debajo del objetivo",
    tone: tables.lowMargin.length ? "bad" : "good",
  });
  insights.push({
    icon: <Coins size={16} aria-hidden />,
    title: "Ventas con costo conocido",
    value: formatPercent(tables.costCoveragePct),
    detail: "El resto no entra en el margen",
  });

  if (kpis.costOfSales.value === "0" && kpis.grossProfit.value === "0")
    return (
      <div className={reportCardClass}>
        <ReportEmptyState
          title="Sin ventas con costo en el período"
          description="La rentabilidad se calcula con el costo de los lotes vendidos."
        />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Ganancia bruta estimada"
          icon={<TrendingUp size={18} aria-hidden />}
          kpi={kpis.grossProfit}
          help="Ventas netas con costo menos el costo de los lotes vendidos. No descuenta gastos fijos ni impuestos: no es ganancia neta."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Margen bruto"
          icon={<Percent size={18} aria-hidden />}
          kpi={kpis.marginPct}
          help="Ganancia / ventas con costo × 100, ponderado por importe. La variación es en puntos porcentuales. Margen no es recargo: un recargo del 25 % sobre el costo es un margen del 20 %."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label="Costo de ventas"
          icon={<ReceiptText size={18} aria-hidden />}
          kpi={kpis.costOfSales}
          higherIsBetter={false}
          help="Costo de los lotes vendidos, menos el de lo devuelto."
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label="Ganancia por ticket"
          icon={<BadgeDollarSign size={18} aria-hidden />}
          kpi={kpis.profitPerTicket}
          help="Ganancia bruta estimada dividida la cantidad de tickets."
        />
      </div>
      <ReportWarnings warnings={meta.dataQuality.warnings} />

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<Coins size={16} aria-hidden />}
        hint="Dónde se gana y dónde se pierde margen."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <ReportPanel
        animar={animar}
        title="De la venta a la ganancia"
        icon={<Coins size={16} aria-hidden />}
        hint="La cuenta del período: lo que vendiste menos lo que te costó la mercadería es lo que ganaste."
      >
        <ProfitEquation
          salesMinor={salesWithCost}
          costMinor={kpis.costOfSales.value ?? "0"}
          profitMinor={kpis.grossProfit.value ?? "0"}
          withoutCostMinor={salesWithoutCost}
          profitPerTicketMinor={kpis.profitPerTicket.value}
        />
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Ganancia y margen"
          icon={<TrendingUp size={16} aria-hidden />}
          hint="Columnas: ganancia bruta. Línea: margen % (eje derecho)."
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
            label="Evolución de ganancia y margen"
          />
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Productos más rentables"
          icon={<Trophy size={16} aria-hidden />}
          hint={
            ranking === "margin"
              ? "Mayor margen entre los que vendieron 3 o más unidades."
              : "Mayor ganancia total; entre paréntesis, las unidades."
          }
          action={
            <ReportSegmented
              label="Ordenar productos por"
              value={ranking}
              options={[
                { id: "profit", label: "Ganancia" },
                { id: "margin", label: "Margen %" },
              ]}
              onChange={setRanking}
            />
          }
        >
          {charts.products.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.products}
              label="Productos más rentables"
              height={300}
            />
          ) : (
            <ReportEmptyState title="Sin productos con costo" />
          )}
        </ReportPanel>
      </div>

      {charts.profitChanges.length ? (
        <ReportPanel
          animar={animar}
          title="¿Dónde se ganó y dónde se perdió?"
          icon={<TrendingDown size={16} aria-hidden />}
          hint="Productos cuya ganancia más cambió contra el período comparado. En rojo, los que dejaron de ganar: revisar precio, costo o faltantes."
        >
          <ReportPanelChart
            tipo="barras"
            option={options.changes}
            label="Cambios de ganancia por producto"
            height={Math.max(200, charts.profitChanges.length * 26)}
          />
        </ReportPanel>
      ) : null}

      <div
        className={`grid gap-4 ${severalBranches ? "xl:grid-cols-[1.4fr_1fr]" : ""}`}
      >
        <ReportPanel
          animar={animar}
          orden={0}
          title="Margen por categoría"
          icon={<Tags size={16} aria-hidden />}
          hint="Ponderado por importe: pesa más lo que más se vende."
        >
          {charts.categories.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.categories}
              label="Margen por categoría"
            />
          ) : (
            <ReportEmptyState title="Sin categorías con costo" />
          )}
        </ReportPanel>
        {severalBranches ? (
          <ReportPanel
            animar={animar}
            orden={1}
            title="Ganancia por sucursal"
            icon={<Store size={16} aria-hidden />}
            hint="Participación de cada sucursal en la ganancia."
          >
            <ReportPanelChart
              tipo="torta"
              option={options.branches}
              label="Ganancia por sucursal"
              height={220}
            />
          </ReportPanel>
        ) : null}
      </div>

      {severalBranches ? (
        <ReportPanel
          animar={animar}
          title="Ingresos, costo y ganancia por sucursal"
          icon={<Store size={16} aria-hidden />}
          hint="La variación de margen es en puntos porcentuales contra el período comparado."
        >
          <ReportTable
            rows={tables.branches}
            rowKey={(row) => row.id ?? row.name}
            empty="Sin sucursales"
            minWidth={680}
            columns={[
              { label: "Sucursal", render: (row) => row.name },
              {
                label: "Ventas con costo",
                numeric: true,
                render: (row) => money(row.netSalesMinor),
              },
              {
                label: "Costo",
                numeric: true,
                render: (row) => money(row.costMinor),
              },
              {
                label: "Ganancia",
                numeric: true,
                render: (row) => money(row.profitMinor),
              },
              {
                label: "Margen",
                numeric: true,
                render: (row) => formatPercent(row.marginPct),
              },
              {
                label: "Var. margen",
                numeric: true,
                render: (row) => formatPp(row.changePp),
                tone: (row) =>
                  row.changePp === null || row.changePp === 0
                    ? "text-slate-400"
                    : row.changePp > 0
                      ? "text-emerald-700"
                      : "text-rose-600",
              },
              {
                label: "% ganancia",
                numeric: true,
                render: (row) => formatPercent(row.sharePct),
              },
            ]}
          />
        </ReportPanel>
      ) : null}

      <ReportPanel
        animar={animar}
        title={`Productos con margen bajo (menos de ${tables.marginTargetPct} %)`}
        icon={<AlertTriangle size={16} aria-hidden />}
        hint="Vendieron 2 o más unidades. Revisá su precio de venta o el costo de compra: el sistema no cambia precios solo."
      >
        <ReportTable<ReportProfitRow>
          rows={tables.lowMargin}
          rowKey={(row) => row.id ?? row.name}
          empty="Ningún producto por debajo del margen objetivo."
          columns={[
            { label: "Producto", render: (row) => row.name },
            {
              label: "Unidades",
              numeric: true,
              render: (row) => row.units.toLocaleString("es-AR"),
            },
            {
              label: "Ventas",
              numeric: true,
              render: (row) => money(row.netSalesMinor),
            },
            {
              label: "Ganancia",
              numeric: true,
              render: (row) => money(row.profitMinor),
            },
            {
              label: "Margen",
              numeric: true,
              render: (row) => formatPercent(row.marginPct),
              tone: (row) =>
                (row.marginPct ?? 0) < 0
                  ? "text-rose-600 font-semibold"
                  : "text-amber-700",
            },
          ]}
        />
      </ReportPanel>
    </div>
  );
}

/** Una cifra de la cuenta: etiqueta con su punto de color, monto y aclaración. */
function EquationTerm({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "sales" | "cost" | "profit";
}): ReactElement {
  const dot = {
    sales: reportStatus.info,
    cost: reportStatus.bad,
    profit: reportStatus.good,
  }[tone];
  return (
    <div className="min-w-0 flex-1 px-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden
        />
        {label}
      </p>
      <p
        className={`mt-1 truncate font-semibold tabular-nums ${tone === "profit" ? "text-2xl text-emerald-700" : "text-xl text-slate-800"}`}
        title={value}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

const Operator = ({ sign }: { sign: string }) => (
  <span
    aria-hidden
    className="hidden shrink-0 self-center text-2xl font-light text-slate-300 md:block"
  >
    {sign}
  </span>
);

/**
 * La cuenta del período escrita como se dice: vendiste − te costó = ganaste,
 * y de cada $100 vendidos cuánto es costo y cuánto queda. Más clara que una
 * cascada de barras flotantes (pedido del usuario, SISTEMA-117).
 */
function ProfitEquation({
  salesMinor,
  costMinor,
  profitMinor,
  withoutCostMinor,
  profitPerTicketMinor,
}: {
  salesMinor: string;
  costMinor: string;
  profitMinor: string;
  withoutCostMinor: string;
  profitPerTicketMinor: string | null;
}): ReactElement {
  const sales = Number(salesMinor);
  const cost = Number(costMinor);
  const profit = Number(profitMinor);
  const costShare = sales > 0 ? Math.round((cost / sales) * 100) : 0;
  const profitShare = sales > 0 ? 100 - costShare : 0;
  const markup = cost > 0 ? Math.round((profit / cost) * 1000) / 10 : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4 md:flex-row md:items-stretch md:gap-3">
        <EquationTerm
          tone="sales"
          label="Vendiste"
          value={formatMoneyMinor(salesMinor)}
          detail="Ventas netas con costo conocido"
        />
        <Operator sign="−" />
        <EquationTerm
          tone="cost"
          label="Te costó la mercadería"
          value={formatMoneyMinor(costMinor)}
          detail="Costo de los lotes vendidos"
        />
        <Operator sign="=" />
        <EquationTerm
          tone="profit"
          label="Ganaste (bruto)"
          value={formatMoneyMinor(profitMinor)}
          detail="Antes de sueldos, alquiler e impuestos"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">
          De cada $100 que vendés
        </p>
        <div className="flex h-8 w-full overflow-hidden rounded-full bg-slate-100 text-xs font-semibold">
          {costShare > 0 ? (
            <span
              className="reportes-barra flex items-center justify-center text-white"
              style={{
                width: `${costShare}%`,
                backgroundColor: reportStatus.bad,
              }}
            >
              {costShare >= 12 ? `$${costShare} son costo` : `$${costShare}`}
            </span>
          ) : null}
          {profitShare > 0 ? (
            <span
              className="reportes-barra flex items-center justify-center border-l-2 border-white text-white"
              style={
                {
                  width: `${profitShare}%`,
                  backgroundColor: reportStatus.good,
                  "--fila": 1,
                } as CSSProperties
              }
            >
              {profitShare >= 12
                ? `$${profitShare} te quedan`
                : `$${profitShare}`}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <ReportStat
            label="Margen"
            value={`${profitShare} %`}
            detail="Ganancia sobre lo vendido"
            tone="good"
          />
          <ReportStat
            label="Recargo sobre el costo"
            value={markup === null ? "—" : formatPercent(markup)}
            detail="Ganancia sobre lo que costó. No es el margen."
          />
          <ReportStat
            label="Ganancia por ticket"
            value={
              profitPerTicketMinor
                ? formatMoneyMinor(profitPerTicketMinor)
                : "—"
            }
            detail="Lo que deja, en promedio, cada venta"
          />
        </div>
      </div>

      {withoutCostMinor !== "0" ? (
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info
            size={14}
            className="mt-0.5 shrink-0 text-slate-400"
            aria-hidden
          />
          Además vendiste {formatMoneyMinor(withoutCostMinor)} sin costo cargado
          (conceptos manuales): no entran en esta cuenta porque no se sabe
          cuánto costaron.
        </p>
      ) : null}
    </div>
  );
}
