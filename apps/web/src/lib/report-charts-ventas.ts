import {
  reportCategorical,
  reportComparisonColor,
  reportPalette,
} from "./report-chart-theme";
import {
  axisMoney,
  bucketLabel,
  tooltipMoney,
  trendOption,
} from "./report-charts";

/**
 * Gráficos de la pestaña Ventas (SISTEMA-115). Mismo tema, ejes y tooltips que
 * los del Resumen; los tooltips suman los tickets para dar contexto.
 */

/** Días de la semana como los guarda la API: 1 = lunes … 7 = domingo. */
export const weekdayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export const weekdayName = (weekday: number) => weekdayNames[weekday - 1] ?? "";

/** "9 h", "18 h": horas locales de 0 a 23. */
export const hourLabel = (hour: number) => `${hour} h`;

export const tickets = (count: number) =>
  `${count.toLocaleString("es-AR")} ${count === 1 ? "ticket" : "tickets"}`;

type TrendUnit = "day" | "week" | "month";

type TooltipParam = {
  seriesName: string;
  value: number;
  marker: string;
  dataIndex: number;
};

const ACTUAL = "Período actual";

/**
 * Evolución de Ventas: como la del Resumen, pero el tooltip suma los tickets
 * del tramo y los del período comparado.
 */
export function salesTrendOption(
  points: readonly {
    bucket: string;
    value: string;
    previous?: string | null;
    tickets: number;
    previousTickets: number | null;
  }[],
  unit: TrendUnit,
  comparisonLabel: string | null,
) {
  return {
    ...trendOption(points, unit, comparisonLabel),
    tooltip: {
      trigger: "axis",
      formatter: (params: TooltipParam[]) => {
        const point = points[params[0]?.dataIndex ?? 0];
        if (!point) return "";
        return [
          `<strong>${bucketLabel(point.bucket, unit)}</strong>`,
          ...params.map((param) => {
            const count =
              param.seriesName === ACTUAL
                ? point.tickets
                : point.previousTickets;
            return `${param.marker}${param.seriesName}: ${tooltipMoney(param.value)}${count === null ? "" : ` · ${tickets(count)}`}`;
          }),
        ].join("<br/>");
      },
    },
  };
}

/** Una línea por sucursal (sin área), con su nombre en la leyenda. */
export function branchTrendOption(
  buckets: readonly string[],
  lines: readonly { name: string; values: readonly string[] }[],
  unit: TrendUnit,
) {
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: {
      type: "scroll",
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: { trigger: "axis", valueFormatter: tooltipMoney },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: buckets.map((bucket) => bucketLabel(bucket, unit)),
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series: lines.map((line, index) => ({
      id: `sucursal-${index}`,
      name: line.name,
      type: "line",
      smooth: true,
      symbolSize: 4,
      data: line.values.map(Number),
    })),
  };
}

type HourRow = {
  hour: number;
  amountMinor: string;
  tickets: number;
  previousAmountMinor: string | null;
};

/** Horas con ventas en alguno de los dos períodos, sin las puntas vacías. */
export function hourRange<T extends HourRow>(rows: readonly T[]): T[] {
  const withSales = rows.filter(
    (row) =>
      row.amountMinor !== "0" || (row.previousAmountMinor ?? "0") !== "0",
  );
  if (!withSales.length) return [...rows];
  const first = withSales[0]!.hour;
  const last = withSales.at(-1)!.hour;
  return rows.filter((row) => row.hour >= first && row.hour <= last);
}

/** Ventas por hora: columnas del período y, si hay comparación, línea punteada. */
export function hourOption(
  rows: readonly HourRow[],
  comparisonLabel: string | null,
) {
  const visible = hourRange(rows);
  const series: Record<string, unknown>[] = [
    {
      id: "actual",
      name: ACTUAL,
      type: "bar",
      barMaxWidth: 22,
      itemStyle: { borderRadius: [4, 4, 0, 0], color: reportPalette[1] },
      emphasis: { itemStyle: { color: reportPalette[0] } },
      data: visible.map((row) => ({
        name: hourLabel(row.hour),
        value: Number(row.amountMinor),
      })),
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
      data: visible.map((row) => Number(row.previousAmountMinor ?? 0)),
    });
  return {
    grid: {
      left: 8,
      right: 16,
      top: comparisonLabel ? 36 : 12,
      bottom: 8,
      containLabel: true,
    },
    ...(comparisonLabel
      ? { legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 8 } }
      : {}),
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: TooltipParam[]) => {
        const row = visible[params[0]?.dataIndex ?? 0];
        if (!row) return "";
        return [
          `<strong>De ${hourLabel(row.hour)} a ${hourLabel(row.hour + 1)}</strong>`,
          ...params.map(
            (param) =>
              `${param.marker}${param.seriesName}: ${tooltipMoney(param.value)}` +
              (param.seriesName === ACTUAL ? ` · ${tickets(row.tickets)}` : ""),
          ),
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: visible.map((row) => hourLabel(row.hour)),
    },
    yAxis: { type: "value", axisLabel: { formatter: axisMoney } },
    series,
  };
}

/**
 * Mapa de calor día de la semana × hora: cuanto más oscuro, más facturado.
 * Muestra sólo el rango de horas con ventas; el lunes arriba.
 */
export function heatmapOption(
  cells: readonly {
    weekday: number;
    hour: number;
    amountMinor: string;
    tickets: number;
  }[],
) {
  const hours = cells.map((cell) => cell.hour);
  const first = hours.length ? Math.min(...hours) : 8;
  const last = hours.length ? Math.max(...hours) : 20;
  const xHours = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  );
  const yDays = [...weekdayNames].reverse();
  const max = Math.max(1, ...cells.map((cell) => Number(cell.amountMinor)));
  return {
    grid: { left: 8, right: 16, top: 8, bottom: 44, containLabel: true },
    tooltip: {
      formatter: ({
        data,
      }: {
        data: { value: [number, number, number]; tickets: number };
      }) => {
        const [x, y, amount] = data.value;
        return `<strong>${yDays[y] ?? ""}, ${hourLabel(xHours[x] ?? 0)}</strong><br/>${tooltipMoney(amount)} · ${tickets(data.tickets)}`;
      },
    },
    xAxis: {
      type: "category",
      data: xHours.map(hourLabel),
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: yDays.map((day) => day.slice(0, 3)),
      splitArea: { show: false },
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      text: ["Más", "Menos"],
      textStyle: { color: "#64748b", fontSize: 11 },
      inRange: { color: ["#edf2f7", "#a5dccf", "#3fa392", "#087f70"] },
    },
    series: [
      {
        id: "mapa",
        type: "heatmap",
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: "#087f70", borderWidth: 1 } },
        data: cells.map((cell) => ({
          value: [
            cell.hour - first,
            yDays.indexOf(weekdayNames[cell.weekday - 1]!),
            Number(cell.amountMinor),
          ],
          tickets: cell.tickets,
        })),
      },
    ],
  };
}

/**
 * Torta con agujero (participación): importe y porcentaje en el tooltip y la
 * leyenda al costado para no tapar las porciones.
 */
export function donutOption(
  items: readonly { name: string; value: number; color?: string }[],
) {
  return {
    color: [...reportCategorical],
    tooltip: {
      trigger: "item",
      formatter: ({
        name,
        value,
        percent,
      }: {
        name: string;
        value: number;
        percent: number;
      }) =>
        `<strong>${name}</strong><br/>${tooltipMoney(value)} · ${percent.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`,
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "middle",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11 },
    },
    series: [
      {
        id: "torta",
        type: "pie",
        radius: ["52%", "78%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 4 },
        emphasis: { scale: true, scaleSize: 4 },
        data: items.map((item) => ({
          name: item.name,
          value: item.value,
          ...(item.color ? { itemStyle: { color: item.color } } : {}),
        })),
      },
    ],
  };
}
