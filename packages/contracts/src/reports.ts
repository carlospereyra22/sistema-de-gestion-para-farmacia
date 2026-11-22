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

export type ReportSalesKpi =
  "netSales" | "tickets" | "averageTicket" | "unitsSold";

/** Agrupación de la evolución de Ventas; la hora tiene su propio gráfico. */
export type ReportSalesTrendUnit = "day" | "week" | "month";

/** Fila de la tabla por sucursal de Ventas (SISTEMA-115). */
export type ReportSalesBranchRow = {
  id: string;
  name: string;
  netSalesMinor: MoneyMinor;
  /** Ventas netas del período comparado; null sin comparación. */
  previousNetSalesMinor: MoneyMinor | null;
  changePct: number | null;
  tickets: number;
  /** Facturado / tickets; null sin tickets. */
  averageTicketMinor: MoneyMinor | null;
  unitsSold: number;
  sharePct: number | null;
};

/**
 * Pestaña Ventas (SISTEMA-115). Hora y día de la semana usan lo facturado por
 * la hora local de confirmación; las devoluciones no tienen hora de venta.
 */
export type ReportSales = ReportResponse<
  ReportSalesKpi,
  {
    trendUnit: ReportSalesTrendUnit;
    /** Ventas netas y tickets por tramo; `previous*` alineado por posición. */
    trend: (ReportSeriesPoint & {
      tickets: number;
      previousTickets: number | null;
    })[];
    /** Con 2 o más sucursales: ventas netas de cada una, alineadas con `trend`. */
    branchTrend: { id: string; name: string; values: MoneyMinor[] }[];
    /** 24 horas (0 a 23): facturado y tickets del período y del comparado. */
    byHour: {
      hour: number;
      amountMinor: MoneyMinor;
      tickets: number;
      previousAmountMinor: MoneyMinor | null;
    }[];
    /** Sólo celdas con ventas. `weekday`: 1 = lunes … 7 = domingo. */
    heatmap: {
      weekday: number;
      hour: number;
      amountMinor: MoneyMinor;
      tickets: number;
    }[];
    paymentMethods: ReportBreakdownItem[];
    categories: (ReportBreakdownItem & { units: number })[];
  },
  {
    branches: ReportSalesBranchRow[];
    /** Lectura rápida del período. */
    insights: {
      peakHour: {
        hour: number;
        amountMinor: MoneyMinor;
        sharePct: number | null;
      } | null;
      bestWeekday: {
        weekday: number;
        amountMinor: MoneyMinor;
        sharePct: number | null;
      } | null;
      /** Sólo con 2 o más sucursales. */
      topBranch: { id: string; name: string; sharePct: number | null } | null;
      discounts: ReportKpi;
      returns: ReportKpi;
      /** Devuelto / facturado × 100. */
      returnRatePct: number | null;
      /** Unidades por ticket, con un decimal. */
      unitsPerTicket: number | null;
    };
  }
>;

/** Agrupación temporal de las pestañas con evolución (SISTEMA-116). */
export type ReportTrendUnit = "day" | "week" | "month";

/* ---------------------------- Rentabilidad ---------------------------- */

export type ReportProfitabilityKpi =
  "grossProfit" | "marginPct" | "costOfSales" | "profitPerTicket";

/** Ventas netas con costo, costo y ganancia de un grupo (producto, categoría...). */
export type ReportProfitRow = {
  id: string | null;
  name: string;
  /** Ventas netas de las líneas con costo de lote. */
  netSalesMinor: MoneyMinor;
  costMinor: MoneyMinor;
  profitMinor: MoneyMinor;
  /** Ganancia / ventas con costo × 100; null sin ventas. Ponderado por importe. */
  marginPct: number | null;
  units: number;
};

/** Pestaña Rentabilidad (SISTEMA-116). Cifras estimadas por costo de lote. */
export type ReportProfitability = ReportResponse<
  ReportProfitabilityKpi,
  {
    trendUnit: ReportTrendUnit;
    trend: {
      bucket: string;
      profitMinor: MoneyMinor;
      netSalesMinor: MoneyMinor;
      marginPct: number | null;
    }[];
    /** Hasta 20, ordenados por ganancia. */
    products: ReportProfitRow[];
    categories: ReportProfitRow[];
  },
  {
    /** Cada sucursal con su margen y la variación en puntos porcentuales. */
    branches: (ReportProfitRow & {
      previousMarginPct: number | null;
      changePp: number | null;
      sharePct: number | null;
    })[];
    /** Productos vendidos con margen por debajo del objetivo. */
    lowMargin: ReportProfitRow[];
    marginTargetPct: number;
    /** Ventas netas con costo / ventas netas × 100. */
    costCoveragePct: number | null;
  }
>;

/* ------------------------------ Productos ----------------------------- */

export type ReportProductsKpi =
  "activeProducts" | "paretoProducts" | "staleProducts" | "lowStock";

export type ReportProductRow = {
  id: string;
  name: string;
  category: string | null;
  units: number;
  netSalesMinor: MoneyMinor;
  /** null sin permiso de costos o sin costo de lote. */
  profitMinor: MoneyMinor | null;
  marginPct: number | null;
  /** Stock vendible actual en las sucursales del alcance. */
  stock: number;
  /** Unidades vendidas / stock actual: aproximada (no reconstruye el promedio). */
  rotation: number | null;
};

/** Pestaña Productos (SISTEMA-116). */
export type ReportProducts = ReportResponse<
  ReportProductsKpi,
  {
    /** Hasta 20, por unidades netas. */
    top: ReportProductRow[];
    categories: ReportBreakdownItem[];
    /** Productos con ventas y stock, para rotación contra margen (o ventas). */
    rotation: ReportProductRow[];
  },
  {
    /** Productos activos con stock y sin ventas en `staleDays` días. */
    stale: {
      id: string;
      name: string;
      category: string | null;
      stock: number;
      /** Stock × costo; null sin permiso de costos. */
      stockValueMinor: MoneyMinor | null;
      lastSaleAt: string | null;
      daysWithoutSales: number | null;
    }[];
    staleDays: number;
    /** Cuántos productos hacen el 80 % de las ventas netas y sobre cuántos con ventas. */
    pareto: { products: number; ofProducts: number; sharePct: number | null };
  }
>;

/* ----------------------------- Inventario ----------------------------- */

export type ReportInventoryKpi =
  "stockValue" | "lowStock" | "outOfStock" | "expiringLots";

/** Pestaña Inventario (SISTEMA-116). Estado actual; la evolución usa movimientos. */
export type ReportInventory = ReportResponse<
  ReportInventoryKpi,
  {
    trendUnit: ReportTrendUnit;
    /**
     * Stock al cierre de cada tramo, reconstruido con InventoryMovement.
     * `valueMinor` es null sin permiso de costos.
     */
    trend: { bucket: string; units: number; valueMinor: MoneyMinor | null }[];
    /** Valor a costo (o unidades sin permiso) por categoría. */
    categories: (ReportBreakdownItem & { units: number })[];
  },
  {
    expiring: {
      lotId: string;
      product: string;
      lot: string;
      branch: string;
      expiresAt: string;
      quantity: number;
      daysLeft: number;
      valueMinor: MoneyMinor | null;
    }[];
    /** Productos con poco stock: unidades, venta diaria y días que alcanza. */
    critical: {
      id: string;
      name: string;
      stock: number;
      dailyUnits: number | null;
      coverageDays: number | null;
    }[];
    lowStockThreshold: number;
    expiryWindowDays: number;
    /** Unidades vendibles, vencidas y totales. */
    units: { sellable: number; expired: number };
    showsValue: boolean;
  }
>;

/* ------------------------------- Compras ------------------------------ */

export type ReportPurchasesKpi =
  "received" | "activeSuppliers" | "pendingInvoices" | "costChange";

/** Pestaña Compras (SISTEMA-116). Lo recibido y lo facturado nunca se suman. */
export type ReportPurchases = ReportResponse<
  ReportPurchasesKpi,
  {
    trendUnit: ReportTrendUnit;
    trend: ReportSeriesPoint[];
    suppliers: ReportBreakdownItem[];
  },
  {
    /** Facturado por proveedores en el período (aparte de lo recibido). */
    invoicedMinor: MoneyMinor;
    pendingInvoices: {
      id: string;
      supplier: string;
      document: string;
      issuedOn: string;
      dueOn: string | null;
      balanceMinor: MoneyMinor;
      daysOverdue: number;
    }[];
    /** Saldo pendiente total y vencido. */
    pendingTotals: { balanceMinor: MoneyMinor; overdueMinor: MoneyMinor };
    costIncreases: {
      id: string;
      name: string;
      previousCostMinor: MoneyMinor;
      currentCostMinor: MoneyMinor;
      changePct: number;
    }[];
    pendingReceipts: {
      purchaseId: string;
      supplier: string;
      reference: string | null;
      orderedAt: string | null;
      ordered: number;
      received: number;
      remaining: number;
      remainingValueMinor: MoneyMinor;
      daysWaiting: number | null;
    }[];
  }
>;

/* ------------------------------ Clientes ------------------------------ */

export type ReportCustomersKpi =
  "activeCustomers" | "accountBalance" | "collected" | "debtors";

/** Pestaña Clientes y cuentas corrientes (SISTEMA-116). Sin DNI, CUIT ni teléfono. */
export type ReportCustomers = ReportResponse<
  ReportCustomersKpi,
  {
    trendUnit: ReportTrendUnit;
    /** Vendido a cuenta y cobrado por tramo (nunca se suman entre sí). */
    trend: {
      bucket: string;
      soldOnAccountMinor: MoneyMinor;
      collectedMinor: MoneyMinor;
      previousCollectedMinor: MoneyMinor | null;
    }[];
    topCustomers: (ReportBreakdownItem & { tickets: number })[];
    /** Saldo por atraso: al día, 1–30, 31–60, 61–90, 91–120, >120 y sin vencimiento. */
    aging: { id: string; name: string; value: MoneyMinor }[];
  },
  {
    debtors: {
      id: string;
      name: string;
      balanceMinor: MoneyMinor;
      overdueMinor: MoneyMinor;
      oldestDaysOverdue: number;
      lastPaymentAt: string | null;
    }[];
    collections: {
      id: string;
      customer: string;
      branch: string;
      createdAt: string;
      amountMinor: MoneyMinor;
      method: string;
    }[];
  }
>;
