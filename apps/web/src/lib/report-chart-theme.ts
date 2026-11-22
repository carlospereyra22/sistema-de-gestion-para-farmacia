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
 * Paleta categórica (SISTEMA-117; profunda en SISTEMA-118, pedido del
 * usuario): partes de un total sin orden (medios de pago, categorías,
 * proveedores). Tonos oscuros y apagados, como el anillo exterior de una
 * rueda de color: se distinguen bien sin gritar.
 */
export const reportCategorical = [
  "#1f6f6b",
  "#2f55a4",
  "#c8641b",
  "#7b2d4f",
  "#c99a12",
  "#3f7d3a",
  "#5b3b8c",
  "#64748b",
] as const;

/** Colores con significado, profundos: bien, atención, mal y sus intermedios. */
export const reportStatus = {
  good: "#2f8f6f",
  info: "#2f6fb0",
  new: "#4b4fa8",
  warn: "#c99a12",
  alert: "#c8641b",
  bad: "#b23a48",
  worst: "#7b2d4f",
  neutral: "#94a3b8",
} as const;

export const reportInk = "#334155";

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
  "#1f6f6b": "#3fb3aa",
  "#2f55a4": "#6f93e0",
  "#c8641b": "#e8904e",
  "#7b2d4f": "#c46b93",
  "#c99a12": "#e6bd45",
  "#3f7d3a": "#79b672",
  "#5b3b8c": "#9b7fd0",
  "#2f8f6f": "#5cc09c",
  "#2f6fb0": "#6aa6e3",
  "#4b4fa8": "#8589dc",
  "#b23a48": "#e07482",

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
