import {
  reportComparisonColor,
  reportPalette,
  reportStatus,
} from "./report-chart-theme";
import { axisMoney, bucketLabel, tooltipMoney } from "./report-charts";

/**
 * Gráficos de Rentabilidad, Productos, Inventario, Compras y Clientes
 * (SISTEMA-116). Mismo tema, ejes y tooltips que el Resumen y Ventas.
 */

type TrendUnit = "day" | "week" | "month";

/** Opciones del selector de agrupación de las evoluciones. */
export const trendUnitOptions: readonly { id: TrendUnit; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Variación en puntos porcentuales con signo ("+1,5 pp"). */
export const formatPp = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("es-AR", { maximumFractionDigits: 1 })} pp`;

type TooltipParam = {
  seriesName: string;
  value: number | null;
  marker: string;
  dataIndex: number;
};

const percent = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

const legend = { top: 0, right: 0, itemWidth: 14, itemHeight: 8 };

/**
 * Ganancia bruta en columnas (eje izquierdo, pesos) y margen % en línea (eje
 * derecho). Los dos ejes van rotulados para no confundir unidades.
 */
export function profitTrendOption(
  points: readonly {
    bucket: string;
    profitMinor: string;
    netSalesMinor: string;
    marginPct: number | null;
  }[],
  unit: TrendUnit,
) {
  return {
    grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
    legend,
    tooltip: {
      trigger: "axis",
      formatter: (params: TooltipParam[]) => {
        const point = points[params[0]?.dataIndex ?? 0];
        if (!point) return "";
        return [
          `<strong>${bucketLabel(point.bucket, unit)}</strong>`,
          `Ganancia bruta: ${tooltipMoney(Number(point.profitMinor))}`,
          `Ventas con costo: ${tooltipMoney(Number(point.netSalesMinor))}`,
          `Margen: ${percent(point.marginPct)}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: points.map((point) => bucketLabel(point.bucket, unit)),
    },
    yAxis: [
      {
        type: "value",
        name: "Ganancia",
        nameTextStyle: { fontSize: 10, color: "#64748b" },
        axisLabel: { formatter: axisMoney },
      },
      {
        type: "value",
        name: "Margen %",
        nameTextStyle: { fontSize: 10, color: "#64748b" },
        axisLabel: { formatter: (value: number) => `${value} %` },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        id: "ganancia",
        name: "Ganancia bruta",
        type: "bar",
        barMaxWidth: 22,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: reportPalette[2] },
        emphasis: { itemStyle: { color: reportPalette[1] } },
        data: points.map((point) => Number(point.profitMinor)),
      },
      {
        id: "margen",
        name: "Margen %",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        itemStyle: { color: reportPalette[0] },
        data: points.map((point) => point.marginPct),
      },
    ],
  };
}

/** Columnas verticales con su etiqueta (margen por categoría, por ejemplo). */
export function columnsOption(
  items: readonly { name: string; value: number; label?: string }[],
  format: "money" | "percent" | "units",
) {
  const show = (value: number) =>
    format === "money"
      ? tooltipMoney(value)
      : format === "percent"
        ? percent(value)
        : `${value.toLocaleString("es-AR")} u.`;
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: show,
    },
    xAxis: {
      type: "category",
      data: items.map((item) => item.name),
      axisLabel: { interval: 0, width: 90, overflow: "truncate", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) =>
          format === "money"
            ? axisMoney(value)
            : format === "percent"
              ? `${value} %`
              : value.toLocaleString("es-AR"),
      },
    },
    series: [
      {
        id: "columnas",
        type: "bar",
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: reportPalette[1] },
        emphasis: { itemStyle: { color: reportPalette[0] } },
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: "#475569",
          formatter: ({ data }: { data: { label?: string } }) =>
            data.label ?? "",
        },
        data: items.map((item) => ({
          name: item.name,
          value: item.value,
          label: item.label,
        })),
      },
    ],
  };
}

/**
 * Rotación contra margen (o contra ventas, sin permiso de costos). Cada punto
 * es un producto; el tamaño, sus ventas netas. Las líneas punteadas marcan los
 * cortes de los cuadrantes y se dicen en el tooltip.
 */
export function rotationOption(
  rows: readonly {
    name: string;
    rotation: number | null;
    marginPct: number | null;
    netSalesMinor: string;
    units: number;
    stock: number;
  }[],
  axis: "margin" | "sales",
  cuts: { rotation: number; y: number },
) {
  const points = rows.filter(
    (row) =>
      row.rotation !== null && (axis === "sales" || row.marginPct !== null),
  );
  const max = Math.max(1, ...points.map((row) => Number(row.netSalesMinor)));
  return {
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: ({ dataIndex }: { dataIndex: number }) => {
        const row = points[dataIndex];
        if (!row) return "";
        return [
          `<strong>${row.name}</strong>`,
          `Rotación: ${row.rotation?.toLocaleString("es-AR")} (vendió ${row.units} u., stock ${row.stock})`,
          axis === "margin" ? `Margen: ${percent(row.marginPct)}` : "",
          `Ventas netas: ${tooltipMoney(Number(row.netSalesMinor))}`,
        ]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      name: "Rotación",
      nameLocation: "middle",
      nameGap: 24,
      nameTextStyle: { fontSize: 10, color: "#64748b" },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: axis === "margin" ? "Margen %" : "Ventas",
      nameTextStyle: { fontSize: 10, color: "#64748b" },
      axisLabel: {
        formatter: (value: number) =>
          axis === "margin" ? `${value} %` : axisMoney(value),
      },
    },
    series: [
      {
        id: "productos",
        type: "scatter",
        itemStyle: { color: reportPalette[1], opacity: 0.75 },
        emphasis: { itemStyle: { color: reportPalette[0], opacity: 1 } },
        symbolSize: (_value: unknown, params: { dataIndex: number }) => {
          const row = points[params.dataIndex];
          return row ? 8 + 22 * Math.sqrt(Number(row.netSalesMinor) / max) : 8;
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: reportComparisonColor },
          label: { fontSize: 10, color: "#64748b" },
          data: [
            { xAxis: cuts.rotation, label: { formatter: "Rotación media" } },
            {
              yAxis: cuts.y,
              label: {
                formatter: axis === "margin" ? "Margen medio" : "Venta media",
              },
            },
          ],
        },
        data: points.map((row) => [
          row.rotation,
          axis === "margin" ? row.marginPct : Number(row.netSalesMinor),
        ]),
      },
    ],
  };
}

/** Vendido a cuenta (columnas) contra cobrado (línea), y el cobrado anterior. */
export function accountTrendOption(
  points: readonly {
    bucket: string;
    soldOnAccountMinor: string;
    collectedMinor: string;
    previousCollectedMinor: string | null;
  }[],
  unit: TrendUnit,
  comparisonLabel: string | null,
) {
  const series: Record<string, unknown>[] = [
    {
      id: "vendido",
      name: "Vendido a cuenta",
      type: "bar",
      barMaxWidth: 20,
      itemStyle: { borderRadius: [4, 4, 0, 0], color: reportPalette[4] },
      data: points.map((point) => Number(point.soldOnAccountMinor)),
    },
    {
      id: "cobrado",
      name: "Cobrado",
      type: "line",
      smooth: true,
      symbolSize: 5,
      itemStyle: { color: reportPalette[0] },
      data: points.map((point) => Number(point.collectedMinor)),
    },
  ];
  if (comparisonLabel)
    series.push({
      id: "cobrado-anterior",
      name: `Cobrado (${comparisonLabel.toLowerCase()})`,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { type: "dashed", color: reportComparisonColor },
      itemStyle: { color: reportComparisonColor },
      data: points.map((point) => Number(point.previousCollectedMinor ?? 0)),
    });
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { ...legend, type: "scroll" },
    tooltip: { trigger: "axis", valueFormatter: tooltipMoney },
    xAxis: {
      type: "category",
      data: points.map((point) => bucketLabel(point.bucket, unit)),
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series,
  };
}

/** Stock al cierre de cada tramo: valor a costo o unidades. */
export function stockTrendOption(
  points: readonly {
    bucket: string;
    units: number;
    valueMinor: string | null;
  }[],
  unit: TrendUnit,
  showsValue: boolean,
) {
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: TooltipParam[]) => {
        const point = points[params[0]?.dataIndex ?? 0];
        if (!point) return "";
        return [
          `<strong>Al cierre de ${bucketLabel(point.bucket, unit)}</strong>`,
          showsValue && point.valueMinor !== null
            ? `Valor a costo: ${tooltipMoney(Number(point.valueMinor))}`
            : "",
          `Unidades: ${point.units.toLocaleString("es-AR")}`,
        ]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => bucketLabel(point.bucket, unit)),
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) =>
          showsValue ? axisMoney(value) : value.toLocaleString("es-AR"),
      },
    },
    series: [
      {
        id: "stock",
        name: showsValue ? "Valor del stock" : "Unidades en stock",
        type: "line",
        smooth: true,
        symbolSize: 4,
        areaStyle: { opacity: 0.12 },
        data: points.map((point) =>
          showsValue ? Number(point.valueMinor ?? 0) : point.units,
        ),
      },
    ],
  };
}

/** Colores de la antigüedad: al día en verde, cuanto más atraso, más rojo. */
const agingColors: Record<string, string> = {
  current: "#3fa392",
  "1-30": "#a5dccf",
  "31-60": "#fcd34d",
  "61-90": "#f59e0b",
  "91-120": "#f97316",
  "120+": "#e11d48",
  undated: "#94a3b8",
};

/** Antigüedad de saldos en columnas, del día al más atrasado. */
export function agingOption(
  items: readonly { id: string; name: string; value: string }[],
) {
  const total = items.reduce((sum, item) => sum + Number(item.value), 0);
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: TooltipParam[]) => {
        const item = items[params[0]?.dataIndex ?? 0];
        if (!item) return "";
        const value = Number(item.value);
        return `<strong>${item.name}</strong><br/>${tooltipMoney(value)} · ${percent(total ? (value / total) * 100 : null)} del saldo`;
      },
    },
    xAxis: {
      type: "category",
      data: items.map((item) => item.name),
      axisLabel: { interval: 0, fontSize: 10 },
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series: [
      {
        id: "antiguedad",
        type: "bar",
        barMaxWidth: 36,
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: "#475569",
          formatter: ({ value }: { value: number }) =>
            value ? axisMoney(value) : "",
        },
        data: items.map((item) => ({
          name: item.name,
          value: Number(item.value),
          itemStyle: {
            color: agingColors[item.id] ?? reportPalette[1],
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
    ],
  };
}

/** Clientes nuevos (primera compra) y recurrentes por tramo, apilados. */
export function newVsReturningOption(
  points: readonly {
    bucket: string;
    newCount: number;
    returningCount: number;
  }[],
  unit: TrendUnit,
) {
  const series = [
    {
      id: "recurrentes",
      name: "Volvieron",
      color: reportStatus.good,
      key: "returningCount" as const,
    },
    {
      id: "nuevos",
      name: "Nuevos",
      color: reportStatus.new,
      key: "newCount" as const,
    },
  ];
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: TooltipParam[]) => {
        const point = points[params[0]?.dataIndex ?? 0];
        if (!point) return "";
        const total = point.newCount + point.returningCount;
        return [
          `<strong>${bucketLabel(point.bucket, unit)}</strong>`,
          ...params.map(
            (param) =>
              `${param.marker}${param.seriesName}: ${param.value ?? 0}`,
          ),
          total
            ? `Volvieron: ${Math.round((point.returningCount / total) * 100)} % de los clientes`
            : "",
        ]
          .filter(Boolean)
          .join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: points.map((point) => bucketLabel(point.bucket, unit)),
    },
    yAxis: { type: "value", minInterval: 1 },
    series: series.map((serie, index) => ({
      id: serie.id,
      name: serie.name,
      type: "bar",
      stack: "clientes",
      barMaxWidth: 22,
      itemStyle: {
        color: serie.color,
        borderRadius: index === series.length - 1 ? [4, 4, 0, 0] : 0,
      },
      data: points.map((point) => point[serie.key]),
    })),
  };
}

/** Cuántos clientes compran cada tantos días: de seguido (verde) a esporádico. */
export function frequencyOption(
  items: readonly { id: string; name: string; customers: number }[],
) {
  const colors: Record<string, string> = {
    "7": "#0d9488",
    "15": "#14b8a6",
    "30": "#0ea5e9",
    "60": "#6366f1",
    "90": "#a855f7",
    more: "#f59e0b",
    once: "#94a3b8",
  };
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) =>
        `${value} ${value === 1 ? "cliente" : "clientes"}`,
    },
    xAxis: {
      type: "category",
      data: items.map((item) => item.name),
      axisLabel: { interval: 0, fontSize: 10, width: 70, overflow: "break" },
    },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        id: "frecuencia",
        type: "bar",
        barMaxWidth: 34,
        label: { show: true, position: "top", fontSize: 10, color: "#475569" },
        data: items.map((item) => ({
          name: item.name,
          value: item.customers,
          itemStyle: {
            color: colors[item.id] ?? reportPalette[1],
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
    ],
  };
}

/**
 * Curva de Pareto: ventas de cada producto (columnas, de mayor a menor) y el %
 * acumulado (línea, eje derecho) con la marca del 80 %.
 */
export function paretoOption(
  rows: readonly { name: string; valueMinor: string; cumulativePct: number }[],
) {
  const cut = rows.findIndex((row) => row.cumulativePct >= 80);
  return {
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    legend,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: TooltipParam[]) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        if (!row) return "";
        return `<strong>${row.name}</strong><br/>Ventas: ${tooltipMoney(Number(row.valueMinor))}<br/>Acumulado: ${percent(row.cumulativePct)}`;
      },
    },
    xAxis: {
      type: "category",
      data: rows.map((_, index) => `${index + 1}`),
      name: "Productos, de mayor a menor venta",
      nameLocation: "middle",
      nameGap: 22,
      nameTextStyle: { fontSize: 10, color: "#64748b" },
    },
    yAxis: [
      { type: "value", axisLabel: { formatter: axisMoney } },
      {
        type: "value",
        max: 100,
        axisLabel: { formatter: (value: number) => `${value} %` },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        id: "ventas",
        name: "Ventas del producto",
        type: "bar",
        barMaxWidth: 16,
        data: rows.map((row, index) => ({
          value: Number(row.valueMinor),
          itemStyle: {
            // Los que hacen el 80 % en verde; el resto, más claro.
            color: cut < 0 || index <= cut ? reportStatus.good : "#a5dccf",
            borderRadius: [3, 3, 0, 0],
          },
        })),
      },
      {
        id: "acumulado",
        name: "% acumulado",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbol: "none",
        itemStyle: { color: reportStatus.new },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: reportStatus.warn },
          label: { formatter: "80 %", fontSize: 10, color: "#64748b" },
          data: [{ yAxis: 80 }],
        },
        data: rows.map((row) => row.cumulativePct),
      },
    ],
  };
}

/**
 * Cascada de rentabilidad: ventas con costo, menos el costo, da la ganancia.
 * Lo que no tiene costo de lote va aparte, en gris.
 */
export function waterfallOption(values: {
  salesMinor: number;
  costMinor: number;
  profitMinor: number;
  withoutCostMinor: number;
}) {
  const steps = [
    {
      name: "Ventas con costo",
      base: 0,
      value: values.salesMinor,
      color: reportStatus.info,
    },
    {
      name: "Costo de lo vendido",
      base: values.profitMinor,
      value: values.costMinor,
      color: reportStatus.bad,
    },
    {
      name: "Ganancia bruta",
      base: 0,
      value: values.profitMinor,
      color: reportStatus.good,
    },
    ...(values.withoutCostMinor > 0
      ? [
          {
            name: "Ventas sin costo",
            base: 0,
            value: values.withoutCostMinor,
            color: reportStatus.neutral,
          },
        ]
      : []),
  ];
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: { dataIndex: number }[]) => {
        const step = steps[params[0]?.dataIndex ?? 0];
        return step
          ? `<strong>${step.name}</strong><br/>${tooltipMoney(step.value)}`
          : "";
      },
    },
    xAxis: {
      type: "category",
      data: steps.map((step) => step.name),
      axisLabel: { interval: 0, fontSize: 11 },
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series: [
      {
        id: "base",
        type: "bar",
        stack: "cascada",
        silent: true,
        itemStyle: { color: "transparent" },
        data: steps.map((step) => step.base),
      },
      {
        id: "valor",
        type: "bar",
        stack: "cascada",
        barMaxWidth: 56,
        label: {
          show: true,
          position: "top",
          fontSize: 11,
          color: "#334155",
          formatter: ({ value }: { value: number }) => axisMoney(value),
        },
        data: steps.map((step) => ({
          value: step.value,
          itemStyle: { color: step.color, borderRadius: [5, 5, 0, 0] },
        })),
      },
    ],
  };
}

/**
 * Columnas con un color por grupo (calendarios de vencimientos y de pagos):
 * lo urgente en rojo, lo próximo en ámbar y lo lejano en tonos fríos.
 */
export function calendarOption(
  items: readonly {
    name: string;
    value: number;
    color: string;
    detail?: string;
  }[],
  format: "money" | "units",
) {
  const show = (value: number) =>
    format === "money"
      ? tooltipMoney(value)
      : `${value.toLocaleString("es-AR")} u.`;
  return {
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: { dataIndex: number }[]) => {
        const item = items[params[0]?.dataIndex ?? 0];
        return item
          ? `<strong>${item.name}</strong><br/>${show(item.value)}${item.detail ? `<br/>${item.detail}` : ""}`
          : "";
      },
    },
    xAxis: {
      type: "category",
      data: items.map((item) => item.name),
      axisLabel: { interval: 0, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) =>
          format === "money" ? axisMoney(value) : value.toLocaleString("es-AR"),
      },
    },
    series: [
      {
        id: "calendario",
        type: "bar",
        barMaxWidth: 40,
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: "#475569",
          formatter: ({ value }: { value: number }) =>
            value
              ? format === "money"
                ? axisMoney(value)
                : value.toLocaleString("es-AR")
              : "",
        },
        data: items.map((item) => ({
          name: item.name,
          value: item.value,
          itemStyle: { color: item.color, borderRadius: [4, 4, 0, 0] },
        })),
      },
    ],
  };
}
