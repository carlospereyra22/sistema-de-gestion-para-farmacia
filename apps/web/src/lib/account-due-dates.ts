import { apiFetch as fetch } from "./api-fetch";
import { apiBaseUrl, getCustomerAccounts } from "./api";
import { ventasDeLaPc } from "./bandeja-ventas";
import { vencimientosConPendientes, ventaACuenta } from "./cuenta-sin-conexion";

export type AccountDueRow = {
  saleId: string;
  customerId: string;
  customerName: string;
  saleDate: string | null;
  dueDate: string | null;
  pendingMinor: string | null;
  daysOverdue: number;
  status: "REVIEW" | "UNDATED" | "TODAY" | "OVERDUE" | "UPCOMING";
  reviewReason: string | null;
};
export type AccountDueDates = { today: string; rows: AccountDueRow[] };
export function scopeDueRows(rows: AccountDueRow[], customerId?: string) {
  return customerId === undefined
    ? rows
    : rows.filter((row) => row.customerId === customerId);
}
export type DueFilter =
  | "ALL"
  | "UPCOMING"
  | "TODAY"
  | "1-15"
  | "16-30"
  | "31-60"
  | "60+"
  | "UNDATED"
  | "REVIEW";
export const dueFilters: { id: DueFilter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "UPCOMING", label: "En término" },
  { id: "TODAY", label: "Vence hoy" },
  { id: "1-15", label: "1–15 días" },
  { id: "16-30", label: "16–30 días" },
  { id: "31-60", label: "31–60 días" },
  { id: "60+", label: "Más de 60 días" },
  { id: "UNDATED", label: "Sin vencimiento" },
  { id: "REVIEW", label: "Por revisar" },
];
export function matchesDueFilter(row: AccountDueRow, filter: DueFilter) {
  if (filter === "ALL") return true;
  if (["UPCOMING", "TODAY", "UNDATED", "REVIEW"].includes(filter))
    return row.status === filter;
  if (row.status !== "OVERDUE") return false;
  const days = row.daysOverdue;
  return filter === "1-15"
    ? days >= 1 && days <= 15
    : filter === "16-30"
      ? days >= 16 && days <= 30
      : filter === "31-60"
        ? days >= 31 && days <= 60
        : days > 60;
}
export function matchesDueFilters(row: AccountDueRow, filters: DueFilter[]) {
  return (
    filters.length === 0 ||
    filters.some((filter) => matchesDueFilter(row, filter))
  );
}
export async function getAccountDueDates(
  token: string,
  org: string,
  branch: string,
): Promise<AccountDueDates> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/due-dates`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error(
      "No se pudieron cargar los vencimientos. Volvé a intentar.",
    );
  const base = (await response.json()) as AccountDueDates;
  // Con lo hecho en la PC que todavía no llegó (SISTEMA-70).
  const bandeja = await ventasDeLaPc().catch(() => []);
  if (!bandeja.some((item) => item.estado === "PENDIENTE")) return base;
  const cuentas = bandeja.some(
    (item) => item.estado === "PENDIENTE" && ventaACuenta(item),
  )
    ? await getCustomerAccounts(token, org, branch).catch(() => [])
    : [];
  return vencimientosConPendientes(base, bandeja, org, branch, cuentas);
}
