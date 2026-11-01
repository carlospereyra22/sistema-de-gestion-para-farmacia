/**
 * Contrato compartido de Reportes. Las formulas de cada metrica estan en
 * docs/REPORTS_PLAN.md ("Mapa de metricas"); este archivo solo define formas.
 * Solo tipos: las constantes (REPORT_TABS, REPORT_DEFAULTS, ALL_BRANCHES) viven en
 * index.ts porque la API carga este paquete desde el codigo fuente.
 */

/** Centavos enteros como string: "123456" = $1.234,56. Nunca float. */
export type MoneyMinor = string;

export type ReportTab =
  | "summary"
  | "sales"
  | "profitability"
  | "products"
  | "inventory"
  | "purchases"
  | "customers";

export type ReportComparison = "previous" | "yearAgo" | "none";
export type ReportGranularity = "hour" | "day" | "week" | "month";
export type ReportPaymentMethod =
  "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
export type ReportExpiryWindowDays = 30 | 60 | 90;

/**
 * Filtros comunes. `from` y `to` son fechas civiles de Argentina (YYYY-MM-DD),
 * ambas inclusivas; la API consulta `[from, to + 1 dia)`. Cada endpoint documenta
 * cuales filtros opcionales acepta y rechaza los que no aplican.
 */
export type ReportFilters = {
  from: string;
  to: string;
  /** UUID de una sucursal autorizada o `ALL_BRANCHES`. */
  branchId: string;
  comparison: ReportComparison;
  granularity?: ReportGranularity;
  categoryIds?: string[];
  laboratoryIds?: string[];
  supplierIds?: string[];
  paymentMethods?: ReportPaymentMethod[];
  lowStockThreshold?: number;
  staleDays?: number;
  expiryWindowDays?: ReportExpiryWindowDays;
};

export type ReportOption = { id: string; name: string };

/** Opciones de filtro ya limitadas a lo que el usuario puede ver. */
export type ReportFilterOptions = {
  /** Sucursales activas autorizadas. Con 2 o mas la UI ofrece "Todas". */
  branches: ReportOption[];
  categories: (ReportOption & { parentId: string | null })[];
  laboratories: ReportOption[];
  suppliers: ReportOption[];
  /** Que puede ver/hacer el usuario, segun sus permisos. */
  access: {
    profitability: boolean;
    purchases: boolean;
    customers: boolean;
    export: boolean;
  };
};

/** Por que una metrica no tiene valor; la UI muestra un texto para cada caso. */
export type ReportUnavailableReason =
  "NO_DATA" | "NOT_RECORDED" | "INSUFFICIENT_HISTORY" | "FORBIDDEN";

export type ReportKpiUnit = "money" | "count" | "percent" | "units";

/**
 * Indicador con comparacion. `value`/`previous` van como string: centavos para
 * `money`, entero para `count`/`units`, y decimal con punto para `percent` ("31.9").
 * `changePct` es null si no hay base de comparacion valida (anterior 0 o ausente).
 */
export type ReportKpi = {
  unit: ReportKpiUnit;
  available: boolean;
  unavailableReason?: ReportUnavailableReason;
  value: string | null;
  previous: string | null;
  changePct: number | null;
  /** Solo para porcentajes: diferencia en puntos porcentuales (actual − anterior). */
  changePp?: number | null;
  /** true cuando la cifra es una estimacion (por ejemplo, costo por lote). */
  estimated?: boolean;
};

export type ReportDataQuality = {
  partial: boolean;
  /** Textos en espanol listos para mostrar como aviso. */
  warnings: string[];
};

export type ReportMeta = {
  report: ReportTab;
  currency: "ARS";
  timezone: string;
  from: string;
  to: string;
  comparison: ReportComparison;
  /** Periodo comparado ya resuelto; null si `comparison` es "none". */
  previousFrom: string | null;
  previousTo: string | null;
  /** Sucursales que realmente entraron en el calculo. */
  branchIds: string[];
  generatedAt: string;
  dataQuality: ReportDataQuality;
};

/** Punto de una serie temporal; `bucket` es la fecha/hora local del grupo. */
export type ReportSeriesPoint = {
  bucket: string;
  value: string;
  previous?: string | null;
};

/** Parte de un total (categoria, medio de pago, sucursal, proveedor...). */
export type ReportBreakdownItem = {
  id: string | null;
  name: string;
  value: string;
  sharePct: number | null;
};

/** Forma general de la respuesta de cada pestana. */
export type ReportResponse<
  TKpis extends string,
  TCharts extends Record<string, unknown> = Record<string, never>,
  TTables extends Record<string, unknown> = Record<string, never>,
> = {
  meta: ReportMeta;
  kpis: Record<TKpis, ReportKpi>;
  charts: TCharts;
  tables: TTables;
};

/** Detalle paginado para drill-down. */
export type ReportPage<TRow> = {
  rows: TRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** Totales de cierres de caja de un grupo (dia o mes, en hora de Argentina). */
export type ReportCashClosureGroup = {
  period: string;
  count: number;
  expectedMinor: MoneyMinor;
  countedMinor: MoneyMinor;
  differenceMinor: MoneyMinor;
};

export type ReportCashClosures = Omit<ReportCashClosureGroup, "period"> & {
  daily: ReportCashClosureGroup[];
  monthly: ReportCashClosureGroup[];
};

export type ReportOverviewKpi =
  "netSales" | "grossProfit" | "averageTicket" | "unitsSold";

/** Fila de la tabla por sucursal; `grossProfitMinor` es null sin permiso de costos. */
export type ReportBranchRow = {
  id: string;
  name: string;
  netSalesMinor: MoneyMinor;
  grossProfitMinor: MoneyMinor | null;
  tickets: number;
  unitsSold: number;
  sharePct: number | null;
};

export type ReportAlert = {
  kind: "expired" | "expiring" | "lowStock";
  /** Cantidad de lotes (vencidos/por vencer) o productos (stock bajo). */
  count: number;
  /** Ventana o umbral aplicado: dias para vencimientos, unidades para stock bajo. */
  threshold: number;
};

/** Pestana Resumen. Formulas en docs/REPORTS_PLAN.md. */
export type ReportOverview = ReportResponse<
  ReportOverviewKpi,
  {
    /** Ventas netas por periodo; `previous` alineado por posicion. */
    salesTrend: ReportSeriesPoint[];
    trendGranularity: "day" | "month";
    salesByCategory: ReportBreakdownItem[];
    /** Sobre ventas facturadas (el vuelto se resta al efectivo). */
    paymentMethods: ReportBreakdownItem[];
    /** Top 10 por unidades; `units` netas de devoluciones. */
    topProducts: (ReportBreakdownItem & { units: number })[];
  },
  {
    branches: ReportBranchRow[];
    alerts: ReportAlert[];
    cashClosures: ReportCashClosures;
  }
>;
