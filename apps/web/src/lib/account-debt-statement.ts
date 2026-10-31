import { accountStatementStyle } from "./account-statement-style";
import type { AccountDueRow } from "./account-due-dates";

export type StatementFilter = { customerId: string; from: string; to: string };
export function argentinaSaleDate(value: string | null): string | null {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}
export function statementRows(rows: AccountDueRow[], filter: StatementFilter) {
  const scoped = rows.filter(
    (row) => !filter.customerId || row.customerId === filter.customerId,
  );
  const unknownDates = scoped.filter(
    (row) => !argentinaSaleDate(row.saleDate),
  ).length;
  return {
    unknownDates: filter.from || filter.to ? unknownDates : 0,
    rows: scoped
      .filter((row) => {
        if (!filter.from && !filter.to) return true;
        const day = argentinaSaleDate(row.saleDate);
        return (
          day !== null &&
          (!filter.from || day >= filter.from) &&
          (!filter.to || day <= filter.to)
        );
      })
      .filter(
        (row) =>
          row.status === "REVIEW" ||
          (row.pendingMinor !== null && BigInt(row.pendingMinor) > 0n),
      )
      .sort(
        (a, b) =>
          a.customerName.localeCompare(b.customerName) ||
          a.customerId.localeCompare(b.customerId) ||
          (a.saleDate ?? "").localeCompare(b.saleDate ?? "") ||
          a.saleId.localeCompare(b.saleId),
      ),
  };
}
export const statementMoney = (minor: bigint) => {
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? "−" : ""}$ ${(absolute / 100n).toLocaleString("es-AR")},${(absolute % 100n).toString().padStart(2, "0")}`;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const date = (value: string | null) =>
  value ? escape(value.split("-").reverse().join("/")) : "Sin fecha";
export function debtStatementHtml(input: {
  rows: AccountDueRow[];
  filter: StatementFilter;
  organization: string;
  branch: string;
  customerLabel: string;
  generatedAt: string;
  unknownDates: number;
  identities: Record<string, string>;
}) {
  const groups = new Map<string, AccountDueRow[]>();
  for (const row of input.rows)
    groups.set(row.customerId, [...(groups.get(row.customerId) ?? []), row]);
  const pending = (rows: AccountDueRow[]) =>
    rows.reduce(
      (sum, row) =>
        sum +
        (row.status !== "REVIEW" && row.pendingMinor !== null
          ? BigInt(row.pendingMinor)
          : 0n),
      0n,
    );
  const reviews = input.rows.filter(
    (row) => row.status === "REVIEW" || row.pendingMinor === null,
  ).length;
  const period =
    input.filter.from || input.filter.to
      ? `${input.filter.from ? date(input.filter.from) : "Sin inicio"} al ${input.filter.to ? date(input.filter.to) : "Sin fin"}`
      : "Todas las fechas de venta";
  const status: Record<AccountDueRow["status"], string> = {
    REVIEW: "Por conciliar",
    UNDATED: "Sin vencimiento",
    TODAY: "Vence hoy",
    OVERDUE: "Vencida",
    UPCOMING: "En término",
  };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen de deuda</title><style>
  ${accountStatementStyle}
  </style></head><body><header class="compact-header"><div><strong>${escape(input.organization)}</strong><p class="muted">${escape(input.branch)}</p></div><div class="report-heading"><h1>Resumen de deuda</h1><p>Ventas: ${escape(period)}</p><p class="muted">Emitido: ${escape(new Date(input.generatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }))}</p></div></header>

  ${reviews || input.unknownDates ? `<div class="warning">${reviews ? `${reviews} venta(s) pendiente(s) de conciliación: sus importes no están incluidos en el total. ` : ""}${input.unknownDates ? `${input.unknownDates} venta(s) sin fecha verificable quedaron fuera del rango seleccionado.` : ""}</div>` : ""}
  ${[...groups].map(([id, rows]) => `<section><h2>Cliente: ${escape(rows[0].customerName)}</h2><p class="muted">${escape(input.identities[id] || `Ficha ${id}`)}</p><table><thead><tr><th style="width:23%">Venta</th><th style="width:16%">Fecha</th><th style="width:18%">Vencimiento</th><th style="width:20%">Estado</th><th class="amount" style="width:23%">Pendiente</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escape(row.saleId.slice(0, 8).toUpperCase())}</td><td>${date(argentinaSaleDate(row.saleDate))}</td><td>${row.dueDate ? date(row.dueDate) : "Sin vencimiento"}</td><td>${escape(status[row.status])}${row.reviewReason ? `<br><span class="muted">${escape(row.reviewReason)}</span>` : ""}</td><td class="amount">${row.status === "REVIEW" || row.pendingMinor === null ? "Por conciliar" : statementMoney(BigInt(row.pendingMinor))}</td></tr>`).join("")}</tbody></table><div class="subtotal">Subtotal confirmado: ${statementMoney(pending(rows))}</div></section>`).join("")}
  ${!input.rows.length ? `<p>${input.filter.customerId ? `Cliente: ${escape(input.customerLabel)}. ` : ""}No hay ventas pendientes para esta selección.</p>` : ""}
  <div class="total"><span>${reviews ? "Total confirmado (parcial)" : "Total pendiente"}</span><span>${statementMoney(pending(input.rows))}</span></div><footer class="muted">Documento informativo. No es factura ni recibo de pago. Emitir este resumen no registra cobros ni modifica la cuenta corriente.</footer></body></html>`;
}
