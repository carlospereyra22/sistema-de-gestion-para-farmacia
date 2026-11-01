/**
 * Tema de ECharts con la paleta del sistema (verde/teal de Caja e Inicio).
 * Series en tonos del mismo verde, de mas oscuro a mas claro, mas un gris para
 * "Otros"; el periodo de comparacion se dibuja en gris punteado.
 */
export const reportPalette = [
  "#087f70",
  "#31826a",
  "#3fa392",
  "#6fc1b1",
  "#a5dccf",
  "#94a3b8",
] as const;

export const reportComparisonColor = "#94a3b8";

const axis = {
  axisLine: { lineStyle: { color: "#dce7ef" } },
  axisTick: { show: false },
  axisLabel: { color: "#64748b", fontSize: 11 },
  splitLine: { lineStyle: { color: "#edf2f7" } },
};

export const reportChartTheme = {
  color: [...reportPalette],
  backgroundColor: "transparent",
  textStyle: { fontFamily: "inherit", color: "#334155" },
  categoryAxis: axis,
  valueAxis: axis,
  legend: { textStyle: { color: "#475569", fontSize: 11 } },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#dce7ef",
    textStyle: { color: "#0f172a", fontSize: 12 },
  },
};
