import {
  ALL_BRANCHES,
  REPORT_DEFAULTS,
  type ReportComparison,
  type ReportFilterOptions,
  type ReportOption,
  type ReportTab,
} from "@gestion/contracts";

/** Pestanas en orden de pantalla; el slug va en `?seccion=` como en otras paginas. */
export const reportTabs = [
  { id: "summary", slug: "resumen", label: "Resumen" },
  { id: "sales", slug: "ventas", label: "Ventas" },
  { id: "profitability", slug: "rentabilidad", label: "Rentabilidad" },
  { id: "products", slug: "productos", label: "Productos" },
  { id: "inventory", slug: "inventario", label: "Inventario" },
  { id: "purchases", slug: "compras", label: "Compras" },
  { id: "customers", slug: "clientes", label: "Clientes" },
] as const satisfies readonly { id: ReportTab; slug: string; label: string }[];

/** Permiso que habilita cada pestana restringida (ver REPORTS_PLAN.md). */
export const restrictedTabs: Partial<
  Record<ReportTab, { key: keyof ReportFilterOptions["access"]; text: string }>
> = {
  profitability: {
    key: "profitability",
    text: "Necesitás el permiso «Ver costos y ganancias en reportes».",
  },
  purchases: { key: "purchases", text: "Necesitás el permiso «Ver compras»." },
  customers: {
    key: "customers",
    text: "Necesitás el permiso de cuentas corrientes.",
  },
};

export function isTabAllowed(
  tab: ReportTab,
  access: ReportFilterOptions["access"] | undefined,
) {
  const rule = restrictedTabs[tab];
  return !rule || Boolean(access?.[rule.key]);
}

export const datePresets = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
  { id: "thisMonth", label: "Este mes" },
  { id: "lastMonth", label: "Mes anterior" },
  { id: "thisYear", label: "Este año" },
  { id: "custom", label: "Personalizado" },
] as const;
export type DatePreset = (typeof datePresets)[number]["id"];

export const comparisonOptions = [
  { id: "previous", label: "Período anterior" },
  { id: "yearAgo", label: "Mismo período del año anterior" },
  { id: "none", label: "Sin comparar" },
] as const satisfies readonly { id: ReportComparison; label: string }[];

export type ReportView = {
  tab: ReportTab;
  preset: DatePreset;
  from: string;
  to: string;
  branchId: string;
  comparison: ReportComparison;
};

/** Parametros de URL propios de Reportes (ademas de `seccion`). */
export const reportSearchKeys = [
  "periodo",
  "desde",
  "hasta",
  "sucursal",
  "comparar",
] as const;

const DAY = 86400000;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const civil = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Fecha civil de Argentina (UTC-3, sin horario de verano). */
export function argentineToday(now = new Date()) {
  return civil(now.getTime() - 3 * 3600000);
}

export function presetRange(
  preset: Exclude<DatePreset, "custom">,
  today: string,
) {
  const day = dayOf(today);
  const [year, month] = today.split("-").map(Number) as [number, number];
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: civil(day - DAY), to: civil(day - DAY) };
    case "last7":
      return { from: civil(day - 6 * DAY), to: today };
    case "last30":
      return {
        from: civil(day - (REPORT_DEFAULTS.rangeDays - 1) * DAY),
        to: today,
      };
    case "thisMonth":
      return { from: civil(Date.UTC(year, month - 1, 1)), to: today };
    case "lastMonth":
      return {
        from: civil(Date.UTC(year, month - 2, 1)),
        to: civil(Date.UTC(year, month - 1, 0)),
      };
    case "thisYear":
      return { from: civil(Date.UTC(year, 0, 1)), to: today };
  }
}

/** Validacion inmediata del rango personalizado; la API vuelve a validarlo. */
export function customRangeError(from: string, to: string, today: string) {
  const valid = (date: string) =>
    CIVIL_DATE.test(date) && civil(dayOf(date)) === date;
  if (!valid(from) || !valid(to)) return "Completá las fechas Desde y Hasta.";
  if (from > to) return "La fecha Desde no puede ser posterior a Hasta.";
  if (to > today) return "La fecha Hasta no puede ser futura.";
  if ((dayOf(to) - dayOf(from)) / DAY + 1 > REPORT_DEFAULTS.maxRangeDays)
    return `El período no puede superar ${REPORT_DEFAULTS.maxRangeDays} días.`;
  return null;
}

/**
 * Opciones del selector de sucursal: con 2 o mas autorizadas se agrega "Todas";
 * con una sola se muestra solo esa. Se recalcula con cada respuesta de la API.
 */
export function branchChoices(branches: readonly ReportOption[]) {
  return branches.length >= 2
    ? [{ id: ALL_BRANCHES, name: "Todas las sucursales" }, ...branches]
    : [...branches];
}

/** Sucursal valida para la seleccion actual; si ya no esta disponible, la primera. */
export function resolveBranchId(
  branchId: string,
  branches: readonly ReportOption[],
) {
  const choices = branchChoices(branches);
  return choices.some((choice) => choice.id === branchId)
    ? branchId
    : (choices[0]?.id ?? ALL_BRANCHES);
}

export function defaultReportView(today: string): ReportView {
  return {
    tab: "summary",
    preset: "last30",
    ...presetRange("last30", today),
    branchId: ALL_BRANCHES,
    comparison: REPORT_DEFAULTS.comparison,
  };
}

/** Lee la vista desde la URL; cualquier valor invalido vuelve al predeterminado. */
export function readReportView(
  params: URLSearchParams,
  today: string,
): ReportView {
  const view = defaultReportView(today);
  const tab = reportTabs.find((item) => item.slug === params.get("seccion"));
  if (tab) view.tab = tab.id;
  const comparison = comparisonOptions.find(
    (item) => item.id === params.get("comparar"),
  );
  if (comparison) view.comparison = comparison.id;
  const branchId = params.get("sucursal");
  if (branchId) view.branchId = branchId;
  const preset = datePresets.find((item) => item.id === params.get("periodo"));
  if (preset?.id === "custom") {
    const from = params.get("desde") ?? "";
    const to = params.get("hasta") ?? "";
    if (!customRangeError(from, to, today))
      Object.assign(view, { preset: "custom", from, to });
  } else if (preset)
    Object.assign(view, { preset: preset.id }, presetRange(preset.id, today));
  return view;
}

/** Escribe la vista en la URL conservando `pagina` y otros parametros ajenos. */
export function writeReportView(params: URLSearchParams, view: ReportView) {
  const next = new URLSearchParams(params);
  for (const key of reportSearchKeys) next.delete(key);
  next.set(
    "seccion",
    reportTabs.find((item) => item.id === view.tab)?.slug ?? "resumen",
  );
  if (view.preset !== "last30") next.set("periodo", view.preset);
  if (view.preset === "custom") {
    next.set("desde", view.from);
    next.set("hasta", view.to);
  }
  if (view.branchId !== ALL_BRANCHES) next.set("sucursal", view.branchId);
  if (view.comparison !== REPORT_DEFAULTS.comparison)
    next.set("comparar", view.comparison);
  return next;
}
