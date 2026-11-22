import type { Tema } from "./tema";

/**
 * Tema de ECharts con la paleta del sistema (verde/teal de Caja e Inicio).
 * Series en tonos del mismo verde, de mas oscuro a mas claro, mas un gris para
 * "Otros"; el periodo de comparacion se dibuja en gris punteado.
 *
 * ECharts no lee variables CSS: en modo oscuro (SISTEMA-105) se usa
 * `reportChartThemeOscuro` y `adaptarOpcionAlTema` cambia los colores claros
 * que traen las opciones por su par oscuro.
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

/**
 * Paleta categórica (SISTEMA-117): para partes de un total que no tienen orden
 * (medios de pago, categorías, proveedores). Distinguible de a pares y en modo
 * oscuro tiene su par más claro.
 */
export const reportCategorical = [
  "#0d9488",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
  "#a855f7",
  "#94a3b8",
] as const;

const categoricaOscura = [
  "#2dd4bf",
  "#818cf8",
  "#fbbf24",
  "#f472b6",
  "#38bdf8",
  "#a3e635",
  "#c084fc",
  "#7d8ca0",
] as const;

/** Colores con significado: bien, atención, mal, y sus intermedios. */
export const reportStatus = {
  good: "#10b981",
  info: "#0ea5e9",
  new: "#6366f1",
  warn: "#f59e0b",
  alert: "#f97316",
  bad: "#e11d48",
  worst: "#9f1239",
  neutral: "#94a3b8",
} as const;

/** Mismo orden que `reportPalette`: la serie principal es la más visible. */
const paletaOscura = [
  "#3fd0b8",
  "#6cc4a6",
  "#3c9e8e",
  "#2d7d71",
  "#2a5f59",
  "#7d8ca0",
] as const;

/** Color claro -> su par en modo oscuro (series, ejes, textos y tooltip). */
const coloresOscuros: Record<string, string> = {
  ...Object.fromEntries(
    reportPalette.map((color, indice) => [color, paletaOscura[indice]]),
  ),
  [reportComparisonColor]: "#6d7c8f",
  ...Object.fromEntries(
    reportCategorical
      .slice(0, 7)
      .map((color, indice) => [color, categoricaOscura[indice]]),
  ),
  "#10b981": "#34d399",
  "#f97316": "#fb923c",
  "#e11d48": "#fb7185",
  "#9f1239": "#f43f5e",
  "#066b60": "#62e3cc",
  "#8fd3c3": "#2a5f59",
  "#334155": "#c3ccd7",
  "#475569": "#a9b5c3",
  "#64748b": "#8f9cad",
  "#0f172a": "#e5eaf0",
  "#dce7ef": "#2c3741",
  "#edf2f7": "#222b33",
  "#ffffff": "#1a2228",
};

function temaDeGrafico(color: (claro: string) => string) {
  const axis = {
    axisLine: { lineStyle: { color: color("#dce7ef") } },
    axisTick: { show: false },
    axisLabel: { color: color("#64748b"), fontSize: 11 },
    splitLine: { lineStyle: { color: color("#edf2f7") } },
  };
  return {
    color: reportPalette.map(color),
    backgroundColor: "transparent",
    textStyle: { fontFamily: "inherit", color: color("#334155") },
    categoryAxis: axis,
    valueAxis: axis,
    legend: { textStyle: { color: color("#475569"), fontSize: 11 } },
    tooltip: {
      backgroundColor: color("#ffffff"),
      borderColor: color("#dce7ef"),
      textStyle: { color: color("#0f172a"), fontSize: 12 },
    },
  };
}

export function colorDeGrafico(color: string, tema: Tema) {
  return tema === "oscuro"
    ? (coloresOscuros[color.toLowerCase()] ?? color)
    : color;
}

export const reportChartTheme = temaDeGrafico((color) => color);
export const reportChartThemeOscuro = temaDeGrafico((color) =>
  colorDeGrafico(color, "oscuro"),
);

/**
 * Copia de la opción con los colores conocidos pasados al tema. Sólo recorre
 * objetos y listas comunes: funciones (formatters) y objetos de ECharts quedan
 * tal cual.
 */
export function adaptarOpcionAlTema<T>(opcion: T, tema: Tema): T {
  if (tema === "claro") return opcion;
  const adaptar = (valor: unknown): unknown => {
    if (typeof valor === "string") return colorDeGrafico(valor, tema);
    if (Array.isArray(valor)) return valor.map(adaptar);
    if (
      valor !== null &&
      typeof valor === "object" &&
      Object.getPrototypeOf(valor) === Object.prototype
    )
      return Object.fromEntries(
        Object.entries(valor).map(([clave, dato]) => [clave, adaptar(dato)]),
      );
    return valor;
  };
  return adaptar(opcion) as T;
}
