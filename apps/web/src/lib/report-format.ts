import type {
  MoneyMinor,
  ReportKpi,
  ReportUnavailableReason,
} from "@gestion/contracts";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Centavos en string a pesos: "198000" -> "$ 1.980,00". */
export function formatMoneyMinor(minor: MoneyMinor) {
  return money.format(Number(minor) / 100);
}

export const unavailableText: Record<ReportUnavailableReason, string> = {
  NO_DATA: "Sin datos para el período",
  NOT_RECORDED: "No disponible: el sistema no registra este dato",
  INSUFFICIENT_HISTORY: "Datos históricos insuficientes",
  FORBIDDEN: "No tenés permiso para ver este dato",
};

export function formatKpiValue(kpi: ReportKpi) {
  if (!kpi.available || kpi.value === null)
    return kpi.unavailableReason === "NO_DATA" ? "—" : "No disponible";
  switch (kpi.unit) {
    case "money":
      return formatMoneyMinor(kpi.value);
    case "percent":
      return `${decimal.format(Number(kpi.value))} %`;
    default:
      return integer.format(Number(kpi.value));
  }
}

export type KpiTrend = {
  text: string;
  direction: "up" | "down" | "flat" | "none";
  /** "good"/"bad" segun `higherIsBetter`; "neutral" si no hay variacion. */
  tone: "good" | "bad" | "neutral";
};

/**
 * Variacion contra el periodo anterior. Los porcentajes se comparan en puntos
 * porcentuales (pp). Subir no siempre es bueno (costos, deuda): lo indica la
 * pantalla con `higherIsBetter`.
 */
export function kpiTrend(kpi: ReportKpi, higherIsBetter = true): KpiTrend {
  const change = kpi.unit === "percent" ? kpi.changePp : kpi.changePct;
  if (!kpi.available || change === null || change === undefined)
    return {
      text: "Sin base de comparación",
      direction: "none",
      tone: "neutral",
    };
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const text = `${sign}${decimal.format(Math.abs(change))}${kpi.unit === "percent" ? " pp" : " %"}`;
  if (change === 0) return { text, direction: "flat", tone: "neutral" };
  const up = change > 0;
  return {
    text,
    direction: up ? "up" : "down",
    tone: up === higherIsBetter ? "good" : "bad",
  };
}
