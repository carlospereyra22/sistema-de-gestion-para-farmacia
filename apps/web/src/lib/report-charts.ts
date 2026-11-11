import type { ReportSeriesPoint } from "@gestion/contracts";
import { reportComparisonColor, reportPalette } from "./report-chart-theme";
import { formatMoneyMinor } from "./report-format";

export const paymentLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  ACCOUNT: "Cuenta corriente",
  OTHER: "Otro",
};

const compact = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
/** Eje en pesos abreviados: 125000000 centavos -> "1,3 M". */
const axisMoney = (minor: number) => compact.format(minor / 100);
const tooltipMoney = (minor: number) => formatMoneyMinor(String(minor));

/** Etiqueta del eje X: "05/10" por dia, "oct 26" por mes. */
export function bucketLabel(bucket: string, granularity: "day" | "month") {
  if (granularity === "day")
    return `${bucket.slice(8, 10)}/${bucket.slice(5, 7)}`;
  return new Date(`${bucket}T12:00:00`).toLocaleDateString("es-AR", {
    month: "short",
    year: "2-digit",
  });
}

/** Evolucion de ventas netas: area del periodo actual y linea punteada del anterior. */
export function trendOption(
  points: readonly ReportSeriesPoint[],
  granularity: "day" | "month",
  comparisonLabel: string | null,
) {
  const series: Record<string, unknown>[] = [
    {
      id: "actual",
      name: "Período actual",
      type: "line",
      smooth: true,
      symbolSize: 5,
      areaStyle: { opacity: 0.12 },
      data: points.map((point) => Number(point.value)),
    },
  ];
  if (comparisonLabel)
    series.push({
      id: "anterior",
      name: comparisonLabel,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { type: "dashed", color: reportComparisonColor },
      itemStyle: { color: reportComparisonColor },
      data: points.map((point) => Number(point.previous ?? 0)),
    });
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 8 },
    tooltip: { trigger: "axis", valueFormatter: tooltipMoney },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => bucketLabel(point.bucket, granularity)),
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series,
  };
}

/**
 * Ranking horizontal (medios de pago, categorias, productos); el primero arriba.
 * Con `share` la etiqueta suma el porcentaje del total. Cada barra lleva su
 * nombre: al cambiar los filtros ECharts la reconoce por el nombre y la anima
 * desde su largo anterior, sin mezclar un producto con la cantidad de otro.
 */
export function rankingOption(
  items: readonly { name: string; value: number; share?: number | null }[],
  format: "money" | "units",
) {
  const rows = [...items].reverse();
  return {
    grid: { left: 8, right: 96, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) =>
        format === "money"
          ? tooltipMoney(value)
          : `${value.toLocaleString("es-AR")} u.`,
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.name),
      axisLabel: {
        width: 150,
        overflow: "truncate",
        color: "#334155",
        fontSize: 11,
      },
    },
    series: [
      {
        id: "ranking",
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: reportPalette[1] },
        // Al pasar el mouse la barra se oscurece apenas, sin cambiar de tamaño.
        emphasis: { itemStyle: { color: reportPalette[0] } },
        label: {
          show: true,
          position: "right",
          fontSize: 11,
          color: "#475569",
          formatter: ({
            value,
            data,
          }: {
            value: number;
            data: { share?: number | null };
          }) =>
            (format === "money"
              ? axisMoney(value)
              : value.toLocaleString("es-AR")) +
            (data.share === undefined || data.share === null
              ? ""
              : ` · ${data.share.toLocaleString("es-AR")} %`),
        },
        data: rows.map((row) => ({
          name: row.name,
          value: row.value,
          share: row.share,
        })),
      },
    ],
  };
}
