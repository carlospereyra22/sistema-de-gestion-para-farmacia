import type { CashSession, ReportSummary } from "./api";
import { cashMoney } from "./cash-session-view";

export type DashboardMetricKey =
  | "sales"
  | "averageTicket"
  | "receivables"
  | "cash"
  | "supplierDebt"
  | "purchases";

export type DashboardMetricTone =
  | "teal"
  | "blue"
  | "indigo"
  | "emerald"
  | "slate"
  | "amber"
  | "rose"
  | "violet";

export type DashboardMetric = {
  key: DashboardMetricKey;
  label: string;
  value: string;
  note: string;
  tone: DashboardMetricTone;
  /** Detalle por renglón, por ejemplo una fila por caja de la sucursal. */
  rows?: { label: string; value: string; open: boolean }[];
};

type CashRegisterStatus = NonNullable<ReportSummary["cashRegisters"]>[number];

/**
 * Tamaño del valor según su largo: un importe nunca se parte en dos líneas,
 * ni en tarjetas angostas (6 por fila).
 */
export function metricValueClass(value: string) {
  return value.length > 13
    ? "text-lg"
    : value.length > 10
      ? "text-xl"
      : "text-2xl";
}

/** Filas visibles en la tarjeta de Caja; el resto se resume en la nota. */
export const DASHBOARD_CASH_ROWS = 2;

/**
 * Caja por caja: una sucursal puede tener varias. Sin la lista (API anterior)
 * se usa la sesión de la caja elegida, como antes.
 */
function cashMetric(
  registers: CashRegisterStatus[] | undefined,
  session: Pick<CashSession, "expectedAmountMinor"> | undefined,
): DashboardMetric {
  if (!registers)
    return {
      key: "cash",
      label: "Caja",
      value: session ? cashMoney(session.expectedAmountMinor) : "Cerrada",
      note: session
        ? "Abierta · efectivo esperado"
        : "Abrí una sesión para cobrar en efectivo",
      tone: session ? "emerald" : "slate",
    };
  const open = registers.filter((register) => register.open);
  const expected = open.reduce(
    (total, register) => total + BigInt(register.expectedAmountMinor ?? "0"),
    0n,
  );
  if (registers.length <= 1) {
    const register = registers[0];
    return {
      key: "cash",
      label: register ? register.name : "Caja",
      value: !register
        ? "Sin cajas"
        : register.open
          ? cashMoney(expected)
          : "Cerrada",
      note: !register
        ? "La sucursal no tiene cajas activas"
        : register.open
          ? "Abierta · efectivo esperado"
          : "Abrí una sesión para cobrar en efectivo",
      tone: open.length ? "emerald" : "slate",
    };
  }
  // Primero las abiertas, que son las que tienen efectivo.
  const ordered = [...open, ...registers.filter((register) => !register.open)];
  const hidden = ordered.length - DASHBOARD_CASH_ROWS;
  return {
    key: "cash",
    label: "Cajas",
    value: `${open.length} de ${registers.length} abiertas`,
    note: open.length
      ? `${cashMoney(expected)} esperado en total${hidden > 0 ? ` · ${plural(hidden, "caja más", "cajas más")}` : ""}`
      : "Todas cerradas",
    tone: open.length ? "emerald" : "slate",
    rows: ordered.slice(0, DASHBOARD_CASH_ROWS).map((register) => ({
      label: register.name,
      value: register.open
        ? cashMoney(register.expectedAmountMinor ?? "0")
        : "Cerrada",
      open: register.open,
    })),
  };
}

/**
 * Total adeudado (igual al saldo de Cuentas por pagar de la sucursal) y, en la
 * nota, cuánto está vencido o vence en los próximos 7 días.
 */
function debtMetric(debt: ReportSummary["supplierDebt"]): DashboardMetric {
  const base = {
    key: "supplierDebt" as const,
    label: "Deuda con proveedores",
  };
  if (!debt)
    return { ...base, value: "—", note: "Sin información", tone: "amber" };
  const overdue = BigInt(debt.overdueMinor);
  const soon = BigInt(debt.todayMinor) + BigInt(debt.next7Minor);
  const parts = [
    ...(overdue > 0n ? [`${cashMoney(overdue)} vencido`] : []),
    ...(soon > 0n ? [`${cashMoney(soon)} vence en 7 días`] : []),
  ];
  return {
    ...base,
    value: cashMoney(debt.totalMinor),
    note: parts.length
      ? parts.join(" · ")
      : BigInt(debt.totalMinor) > 0n && debt.nextDueOn
        ? `Al día · próximo vencimiento ${shortDate(debt.nextDueOn)}`
        : BigInt(debt.totalMinor) > 0n
          ? "Al día · sin fecha de vencimiento"
          : "Sin deudas pendientes",
    tone: overdue > 0n ? "rose" : soon > 0n ? "amber" : "teal",
  };
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const shortDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
};

/**
 * Indicadores de Inicio. Los importes vienen calculados por la API; acá solo se
 * da formato. Sin dato (API anterior o sin resumen) se muestra «—».
 */
export function dashboardMetrics(
  summary: ReportSummary | undefined,
  session: Pick<CashSession, "expectedAmountMinor"> | undefined,
): DashboardMetric[] {
  const receivables = summary?.customerReceivables;
  const debt = summary?.supplierDebt;
  return [
    {
      key: "sales",
      label: "Ventas hoy",
      value: summary ? cashMoney(summary.salesTodayMinor) : "—",
      note: summary
        ? plural(summary.salesTodayCount, "ticket", "tickets")
        : "Actualizando actividad",
      tone: "teal",
    },
    {
      key: "averageTicket",
      label: "Ticket promedio",
      value: summary?.averageTicketMinor
        ? cashMoney(summary.averageTicketMinor)
        : "—",
      note: summary?.salesTodayCount
        ? "Importe por venta de hoy"
        : "Sin ventas hoy",
      tone: "blue",
    },
    {
      key: "receivables",
      label: "A cobrar en cuentas corrientes",
      value: receivables ? cashMoney(receivables.totalMinor) : "—",
      note: !receivables
        ? "Sin información"
        : receivables.count
          ? plural(receivables.count, "cliente con deuda", "clientes con deuda")
          : "Ningún cliente debe",
      tone: "indigo",
    },
    cashMetric(summary?.cashRegisters, session),
    debtMetric(debt),
    {
      key: "purchases",
      label: "Compras por recibir",
      value: summary ? String(summary.pendingPurchases) : "—",
      note: summary
        ? summary.pendingPurchases
          ? "Pedidas o recibidas en parte"
          : "No hay compras pendientes"
        : "Sin información",
      tone: "violet",
    },
  ];
}
