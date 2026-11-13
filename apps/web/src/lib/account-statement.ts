import { apiFetch as fetch, SinConexionError } from "./api-fetch";
import { accountStatementStyle } from "./account-statement-style";
import {
  apiBaseUrl,
  getCustomerAccountMovementsDelServidor,
  getCustomerAccounts,
  type CustomerAccount,
  type CustomerAccountMovement,
} from "./api";
import { ventasDeLaPc } from "./bandeja-ventas";
import { estadoConPendientes } from "./cuenta-sin-conexion";
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
  /** Saldo antes del primer movimiento (si se pidió desde un día). */
  openingBalanceMinor?: string;
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
/** Qué se imprime: un cliente (o todos) y desde qué día (SISTEMA-78). */
export type FiltroDelEstado = { customerId?: string; desde?: string };

/**
 * Estado de cuenta de la sucursal. Se pide sólo lo que se imprime: con un
 * cliente o un día de inicio, el servidor devuelve sólo eso y el saldo
 * anterior (SISTEMA-78). Sin conexión se arma con los movimientos guardados
 * en la PC: los de los clientes con saldo y los que se abrieron en esta PC.
 */
export async function getAccountStatement(
  token: string,
  org: string,
  branch: string,
  filtro: FiltroDelEstado = {},
): Promise<AccountStatementCustomer[]> {
  const consulta = new URLSearchParams();
  if (filtro.customerId) consulta.set("customerId", filtro.customerId);
  if (filtro.desde) consulta.set("desde", filtro.desde);
  const texto = consulta.toString();
  let base: AccountStatementCustomer[];
  try {
    const response = await fetch(
      `${apiBaseUrl}/organizations/${org}/branches/${branch}/customer-accounts/statement${texto ? `?${texto}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok)
      throw new Error(
        "No se pudo cargar el estado de cuenta. Volvé a intentar.",
      );
    base = (await response.json()) as AccountStatementCustomer[];
  } catch (error) {
    if (!(error instanceof SinConexionError)) throw error;
    base = await estadoGuardadoEnLaPc(token, org, branch, filtro);
  }
  // Con lo hecho en la PC que todavía no llegó (SISTEMA-70).
  const bandeja = await ventasDeLaPc().catch(() => []);
  if (!bandeja.some((item) => item.estado === "PENDIENTE")) return base;
  const cuentas = await getCustomerAccounts(token, org, branch).catch(() => []);
  return estadoConPendientes(base, bandeja, org, branch, cuentas).filter(
    (cliente) => !filtro.customerId || cliente.id === filtro.customerId,
  );
}

async function estadoGuardadoEnLaPc(
  token: string,
  org: string,
  branch: string,
  filtro: FiltroDelEstado,
) {
  const cuentas = (await getCustomerAccounts(token, org, branch)).filter(
    (cuenta) =>
      !cuenta.porEnviar &&
      (!filtro.customerId || cuenta.id === filtro.customerId),
  );
  const clientes: {
    cuenta: CustomerAccount;
    movimientos: CustomerAccountMovement[];
  }[] = [];
  for (const cuenta of cuentas)
    try {
      clientes.push({
        cuenta,
        movimientos: await getCustomerAccountMovementsDelServidor(
          token,
          org,
          branch,
          cuenta.id,
        ),
      });
    } catch {
      // Sin copia de sus movimientos en esta PC: no se puede incluir.
    }
  return estadoDesdeMovimientos(clientes, branch, filtro.desde);
}

/**
 * Estado de cuenta de la sucursal con los movimientos de cada cliente, como
 * lo arma el servidor: saldo acumulado en la sucursal y, con `desde`, el
 * saldo anterior y sólo los movimientos desde ese día (de Argentina).
 */
export function estadoDesdeMovimientos(
  clientes: readonly {
    cuenta: Pick<
      CustomerAccount,
      "id" | "name" | "document" | "billingTaxId" | "billingPhone"
    >;
    movimientos: readonly CustomerAccountMovement[];
  }[],
  branchId: string,
  desde?: string,
): AccountStatementCustomer[] {
  return clientes
    .map(({ cuenta, movimientos }) => {
      let saldo = 0n;
      let inicial = 0n;
      const movements: AccountStatementCustomer["movements"] = [];
      const propios = movimientos
        .filter((m) => m.branchId === branchId)
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
      for (const m of propios) {
        saldo +=
          m.type === "DEBIT" ? BigInt(m.amountMinor) : -BigInt(m.amountMinor);
        if (desde && argentinaSaleDate(m.createdAt)! < desde) {
          inicial = saldo;
          continue;
        }
        movements.push({
          id: m.id,
          createdAt: m.createdAt,
          type: m.type,
          amountMinor: m.amountMinor,
          balanceMinor: saldo.toString(),
          note: m.note,
          saleId: m.saleId ?? null,
          showInStatement: m.showInStatement,
        });
      }
      return {
        id: cuenta.id,
        name: cuenta.name,
        document: cuenta.document ?? null,
        billingTaxId: cuenta.billingTaxId ?? null,
        billingPhone: cuenta.billingPhone ?? null,
        openingBalanceMinor: inicial.toString(),
        movements,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
export function accountStatementPeriod(
  customer: AccountStatementCustomer,
  filter: StatementFilter,
) {
  const before = customer.movements.filter(
    (m) => filter.from && argentinaSaleDate(m.createdAt)! < filter.from,
  );
  // Si se pidió desde un día, el servidor ya trae el saldo anterior (SISTEMA-78).
  const opening =
    before.at(-1)?.balanceMinor ?? customer.openingBalanceMinor ?? "0";
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
  </style></head><body><header class="compact-header"><div><strong>${escape(input.organization)}</strong><p class="muted">${escape(input.branch)}</p></div><div class="report-heading"><h1>Resumen de cuenta</h1><p>${period}</p><p class="muted">Emitido: ${escape(new Date(input.generatedAt).toLocaleString("es-AR", { hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }))}</p></div></header>
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
