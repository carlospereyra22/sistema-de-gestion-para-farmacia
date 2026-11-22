import { useMemo, useState, type ReactElement } from "react";
import {
  Archive,
  Boxes,
  Crosshair,
  Hourglass,
  Package,
  PackageX,
  PieChart,
  Tags,
  Target,
  Trophy,
} from "lucide-react";
import type { ReportProducts } from "@gestion/contracts";
import { rankingOption } from "./lib/report-charts";
import { donutOption } from "./lib/report-charts-ventas";
import { formatPercent, rotationOption } from "./lib/report-charts-tabs";
import { formatMoneyMinor } from "./lib/report-format";
import type { ReportView } from "./lib/report-view";
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

export function ReportProductsTab(props: {
  token: string;
  organizationId: string;
  view: ReportView;
  active?: boolean;
}): ReactElement {
  return (
    <ReportTabLoader tab="products" {...props} active={props.active ?? true}>
      {({ data, animar }) => (
        <ReportProductsContent data={data} animar={animar} />
      )}
    </ReportTabLoader>
  );
}

/** Promedio simple de una lista (para el corte de los cuadrantes). */
const average = (values: readonly number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

/**
 * Pestaña Productos (SISTEMA-116): qué concentra la venta, qué rota y qué está
 * parado ocupando plata.
 */
export function ReportProductsContent({
  data,
  animar = false,
}: {
  data: ReportProducts;
  animar?: boolean;
}): ReactElement {
  const { kpis, charts, tables } = data;
  const [metric, setMetric] = useState<"units" | "amount" | "profit">("units");
  const hasProfit = charts.top.some((row) => row.profitMinor !== null);
  const axis = hasProfit ? "margin" : "sales";
  const options = useMemo(() => {
    const value = (row: ReportProducts["charts"]["top"][number]) =>
      metric === "units"
        ? row.units
        : metric === "profit"
          ? Number(row.profitMinor ?? 0)
          : Number(row.netSalesMinor);
    const rotation = charts.rotation;
    return {
      top: rankingOption(
        [...charts.top]
          .sort((left, right) => value(right) - value(left))
          .slice(0, 15)
          .map((row) => ({ name: row.name, value: value(row) })),
        metric === "units" ? "units" : "money",
      ),
      categories: donutOption(
        charts.categories
          .filter((row) => BigInt(row.value) > 0n)
          .slice(0, 10)
          .map((row) => ({ name: row.name, value: Number(row.value) })),
      ),
      rotation: rotationOption(rotation, axis, {
        rotation:
          Math.round(average(rotation.map((row) => row.rotation ?? 0)) * 100) /
          100,
        y:
          axis === "margin"
            ? Math.round(average(rotation.map((row) => row.marginPct ?? 0)))
            : average(rotation.map((row) => Number(row.netSalesMinor))),
      }),
    };
  }, [charts, metric, axis]);

  const staleValue = tables.stale.reduce(
    (sum, row) => sum + BigInt(row.stockValueMinor ?? "0"),
    0n,
  );
  const insights: ReportInsightItem[] = [];
  if (tables.pareto.products)
    insights.push({
      icon: <Target size={16} aria-hidden />,
      title: "Concentran el 80 % de la venta",
      value: `${tables.pareto.products.toLocaleString("es-AR")} de ${tables.pareto.ofProducts.toLocaleString("es-AR")} productos`,
      detail: `El ${formatPercent(tables.pareto.sharePct)} del surtido vendido: que nunca falten`,
    });
  if (charts.top[0])
    insights.push({
      icon: <Trophy size={16} aria-hidden />,
      title: "El más vendido",
      value: charts.top[0].name,
      detail: `${charts.top[0].units.toLocaleString("es-AR")} unidades`,
    });
  insights.push({
    icon: <Hourglass size={16} aria-hidden />,
    title: `Sin ventas en ${tables.staleDays} días`,
    value: `${tables.stale.length.toLocaleString("es-AR")} productos con stock`,
    detail: tables.stale.some((row) => row.stockValueMinor !== null)
      ? `${formatMoneyMinor(staleValue.toString())} inmovilizados a costo`
      : "Stock que no se mueve",
    tone: tables.stale.length ? "bad" : "good",
  });
  const lowRotation = charts.rotation.filter(
    (row) => row.rotation !== null && row.rotation < 0.5,
  ).length;
  insights.push({
    icon: <Archive size={16} aria-hidden />,
    title: "Venden menos de la mitad de su stock",
    value: `${lowRotation.toLocaleString("es-AR")} productos`,
    detail: "Rotación menor a 0,5 en el período",
    tone: lowRotation ? "bad" : "neutral",
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpiCard
          animar={animar}
          orden={0}
          label="Productos activos"
          icon={<Package size={18} aria-hidden />}
          kpi={kpis.activeProducts}
          help="Productos activos y no archivados en las sucursales elegidas."
        />
        <ReportKpiCard
          animar={animar}
          orden={1}
          label="Hacen el 80 % de la venta"
          icon={<Target size={18} aria-hidden />}
          kpi={kpis.paretoProducts}
          higherIsBetter
          help="Cuántos productos, de los que más venden, suman el 80 % de las ventas netas del período (regla de Pareto)."
        />
        <ReportKpiCard
          animar={animar}
          orden={2}
          label={`Sin movimiento (${tables.staleDays} días)`}
          icon={<PackageX size={18} aria-hidden />}
          kpi={kpis.staleProducts}
          higherIsBetter={false}
          help={`Productos activos con stock y sin ventas en los últimos ${tables.staleDays} días. Estado actual.`}
        />
        <ReportKpiCard
          animar={animar}
          orden={3}
          label="Stock bajo"
          icon={<Boxes size={18} aria-hidden />}
          kpi={kpis.lowStock}
          higherIsBetter={false}
          help="Productos con stock vendible de 5 unidades o menos. Estado actual."
        />
      </div>

      <ReportPanel
        animar={animar}
        title="Lectura rápida"
        icon={<Crosshair size={16} aria-hidden />}
        hint="Qué cuidar y qué está ocupando plata."
      >
        <ReportInsightList items={insights} />
      </ReportPanel>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ReportPanel
          animar={animar}
          orden={0}
          title="Productos más vendidos"
          icon={<Trophy size={16} aria-hidden />}
          hint="Netos de devoluciones."
          action={
            <ReportSegmented
              label="Ordenar por"
              value={metric}
              options={[
                { id: "units", label: "Unidades" },
                { id: "amount", label: "Facturación" },
                ...(hasProfit
                  ? [{ id: "profit" as const, label: "Ganancia" }]
                  : []),
              ]}
              onChange={setMetric}
            />
          }
        >
          {charts.top.length ? (
            <ReportPanelChart
              tipo="barras"
              option={options.top}
              label="Productos más vendidos"
              height={Math.max(180, Math.min(15, charts.top.length) * 26)}
            />
          ) : (
            <ReportEmptyState title="Sin productos vendidos en el período" />
          )}
        </ReportPanel>
        <ReportPanel
          animar={animar}
          orden={1}
          title="Participación por categoría"
          icon={<PieChart size={16} aria-hidden />}
          hint="Ventas netas de cada categoría."
        >
          {charts.categories.length ? (
            <ReportPanelChart
              tipo="torta"
              option={options.categories}
              label="Participación por categoría"
              height={260}
            />
          ) : (
            <ReportEmptyState title="Sin ventas por categoría" />
          )}
        </ReportPanel>
      </div>

      <ReportPanel
        animar={animar}
        title={hasProfit ? "Rotación contra margen" : "Rotación contra ventas"}
        icon={<Tags size={16} aria-hidden />}
        hint={
          hasProfit
            ? "Arriba a la derecha, las estrellas: rotan y dejan margen. Abajo a la izquierda, a revisar. Rotación = unidades vendidas / stock actual (aproximada). El tamaño es la venta."
            : "Rotación = unidades vendidas / stock actual (aproximada). El tamaño es la venta."
        }
      >
        {charts.rotation.length ? (
          <ReportPanelChart
            tipo="barras"
            option={options.rotation}
            label="Rotación contra margen"
            height={320}
          />
        ) : (
          <ReportEmptyState title="Sin productos con ventas y stock" />
        )}
      </ReportPanel>

      <ReportPanel
        animar={animar}
        title={`Productos parados (sin ventas en ${tables.staleDays} días)`}
        icon={<Hourglass size={16} aria-hidden />}
        hint="Los que más tiempo llevan sin venderse primero. Candidatos a oferta, devolución al proveedor o traspaso a otra sucursal."
      >
        <ReportTable
          rows={tables.stale}
          rowKey={(row) => row.id}
          empty="Todos los productos con stock tuvieron ventas."
          minWidth={620}
          columns={[
            { label: "Producto", render: (row) => row.name },
            {
              label: "Categoría",
              render: (row) => (
                <span className="text-slate-500">{row.category ?? "—"}</span>
              ),
            },
            {
              label: "Stock",
              numeric: true,
              render: (row) => row.stock.toLocaleString("es-AR"),
            },
            ...(tables.stale.some((row) => row.stockValueMinor !== null)
              ? [
                  {
                    label: "Valor a costo",
                    numeric: true,
                    render: (row: ReportProducts["tables"]["stale"][number]) =>
                      row.stockValueMinor === null
                        ? "—"
                        : formatMoneyMinor(row.stockValueMinor),
                  },
                ]
              : []),
            {
              label: "Días sin venta",
              numeric: true,
              render: (row) =>
                row.daysWithoutSales === null
                  ? "Nunca vendido"
                  : row.daysWithoutSales.toLocaleString("es-AR"),
              tone: () => "text-amber-700",
            },
          ]}
        />
      </ReportPanel>
    </div>
  );
}
