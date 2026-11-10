import { dueSummary } from "../supplier-payables/payable-rules";

/** Ticket promedio en centavos; sin ventas no hay promedio que informar. */
export function averageTicketMinor(totalMinor: bigint, count: number) {
  return count > 0 ? (totalMinor / BigInt(count)).toString() : "0";
}

/** Saldo a cobrar de cuentas corrientes: solo clientes con deuda. */
export function customerReceivables(balances: { saldo: bigint }[]) {
  const deudores = balances.filter((row) => row.saldo > 0n);
  return {
    count: deudores.length,
    totalMinor: deudores
      .reduce((total, row) => total + row.saldo, 0n)
      .toString(),
  };
}

/**
 * Deuda con proveedores para Inicio, con el mismo criterio de vencimientos que
 * Cuentas por pagar (`dueSummary`). Recibe solo cuotas con saldo pendiente.
 */
export function supplierDebt(
  dues: { invoiceId: string; dueOn: Date | null; saldo: bigint }[],
  today: string,
) {
  const pendientes = dues.filter((due) => due.saldo > 0n);
  const summary = dueSummary(
    pendientes.map((due) => ({ dueOn: due.dueOn, amountMinor: due.saldo })),
    today,
  );
  return {
    count: new Set(pendientes.map((due) => due.invoiceId)).size,
    totalMinor: pendientes
      .reduce((total, due) => total + due.saldo, 0n)
      .toString(),
    overdueMinor: summary.overdueMinor,
    todayMinor: summary.todayMinor,
    next7Minor: summary.next7Minor,
    nextDueOn: summary.nextDueOn,
  };
}
