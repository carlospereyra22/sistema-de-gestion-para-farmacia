import { accountStatementStyle } from "./account-statement-style";
import { apiBaseUrl } from "./api";
import {
  argentinaSaleDate,
  statementMoney,
  type StatementFilter,
} from "./account-debt-statement";

export type AccountStatementCustomer = {
  id: string;
  name: string;
  document: string | null;
  billingTaxId: string | null;
  billingPhone: string | null;
  movements: {
    id: string;
    createdAt: string;
    type: "DEBIT" | "CREDIT";
    amountMinor: string;
    balanceMinor: string;
    note: string | null;
    saleId: string | null;
    showInStatement?: boolean;
  }[];
};
export async function getAccountStatement(
  token: string,
  org: string,
  branch: string,
): Promise<AccountStatementCustomer[]> {
  const response = await fetch(
    `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/statement`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error("No se pudo cargar el estado de cuenta. Volvé a intentar.");
  return response.json() as Promise<AccountStatementCustomer[]>;
}
export function accountStatementPeriod(
  customer: AccountStatementCustomer,
  filter: StatementFilter,
) {
  const before = customer.movements.filter(
    (m) => filter.from && argentinaSaleDate(m.createdAt)! < filter.from,
  );
  const opening = before.at(-1)?.balanceMinor ?? "0";
  const movements = customer.movements.filter((m) => {
    const day = argentinaSaleDate(m.createdAt)!;
    return (
      (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)
    );
  });
  return {
    opening,
    closing: movements.at(-1)?.balanceMinor ?? opening,
    movements: movements.filter((m) => m.showInStatement !== false),
  };
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const date = (value: string) => escape(value.split("-").reverse().join("/"));
export function accountStatementHtml(input: {
  customers: AccountStatementCustomer[];
  filter: StatementFilter;
  organization: string;
  branch: string;
  generatedAt: string;
}) {
  const customers = input.customers.filter(
    (c) => !input.filter.customerId || c.id === input.filter.customerId,
  );
  const period =
    input.filter.from || input.filter.to
      ? `${input.filter.from ? date(input.filter.from) : "Inicio de la cuenta"} al ${input.filter.to ? date(input.filter.to) : "hoy"}`
      : "Todas las ventas y cobros";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen de cuenta</title><style>
  ${accountStatementStyle}
  </style></head><body><header class="compact-header"><div><strong>${escape(input.organization)}</strong><p class="muted">${escape(input.branch)}</p></div><div class="report-heading"><h1>Resumen de cuenta</h1><p>${period}</p><p class="muted">Emitido: ${escape(new Date(input.generatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }))}</p></div></header>
  ${customers
    .map((customer) => {
      const { opening, closing, movements } = accountStatementPeriod(
        customer,
        input.filter,
      );
      return `<section><h2>Cliente: ${escape(customer.name)}</h2><p class="muted">${escape([customer.document || customer.billingTaxId || `Ficha ${customer.id}`, customer.billingPhone].filter(Boolean).join(" · "))}</p><p class="balance"><span>Saldo inicial del período</span><strong>${statementMoney(BigInt(opening))}</strong></p><table><thead><tr><th style="width:14%">Fecha</th><th style="width:32%">Detalle del movimiento</th><th class="amount" style="width:18%">Compras / cargos</th><th class="amount" style="width:18%">Pagos / créditos</th><th class="amount" style="width:18%">Saldo</th></tr></thead><tbody>${movements.map((m) => `<tr><td>${date(argentinaSaleDate(m.createdAt)!)}</td><td><span class="movement">${m.type === "DEBIT" ? (m.saleId ? "Compra a cuenta" : "Cargo en cuenta") : "Pago / crédito"}${m.saleId ? ` · Venta ${escape(m.saleId.slice(0, 8).toUpperCase())}` : ""}</span>${m.note && m.note !== `Sale ${m.saleId}` ? `<br>${escape(m.note)}` : ""}<span class="reference">Ref. ${escape(m.id.slice(0, 8))}</span></td><td class="amount">${m.type === "DEBIT" ? statementMoney(BigInt(m.amountMinor)) : "—"}</td><td class="amount credit">${m.type === "CREDIT" ? statementMoney(BigInt(m.amountMinor)) : "—"}</td><td class="amount">${statementMoney(BigInt(m.balanceMinor))}</td></tr>`).join("")}</tbody></table>${!movements.length ? "<p>Sin movimientos en este período.</p>" : ""}<p class="balance closing"><span>Saldo final · ${BigInt(closing) < 0n ? "A favor del cliente" : BigInt(closing) === 0n ? "Cuenta saldada" : "Pendiente de pago"}</span><strong>${statementMoney(BigInt(closing))}</strong></p></section>`;
    })
    .join(
      "",
    )}${!customers.length ? "<p>No hay clientes para esta selección.</p>" : ""}<footer class="muted">Documento informativo. No es factura ni recibo. Imprimir no registra cobros ni modifica la cuenta.</footer></body></html>`;
}
