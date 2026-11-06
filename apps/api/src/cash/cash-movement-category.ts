export type CashMovementCategory =
  | "SALE_CHANGE"
  | "SALE_CHANGE_REVERSAL"
  | "ACCOUNT_COLLECTION"
  | "PENDING_ASSIGNMENT"
  | "PENDING_REVERSAL"
  | "CREDIT_NOTE"
  | "MANUAL";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// El origen sólo queda en el concepto. Se exige el UUID del comprobante para que
// un motivo manual parecido no se confunda con un movimiento automático.
const patterns: [Exclude<CashMovementCategory, "MANUAL">, RegExp][] = [
  ["SALE_CHANGE", new RegExp(`^(Vuelto de venta|Change for sale) ${uuid}$`)],
  [
    "SALE_CHANGE_REVERSAL",
    new RegExp(`^Anulación de vuelto · Venta ${uuid}: `),
  ],
  [
    "ACCOUNT_COLLECTION",
    new RegExp(`^Cobro cuenta corriente · .* · Recibo ${uuid}$`),
  ],
  [
    "PENDING_ASSIGNMENT",
    new RegExp(`^Asignación de cobro sin caja · (Venta|Recibo) ${uuid} · `),
  ],
  [
    "PENDING_REVERSAL",
    new RegExp(`^Anulación de cobro asignado · Venta ${uuid}: `),
  ],
  ["CREDIT_NOTE", new RegExp(`^Nota de crédito ${uuid}: `)],
];

export function cashMovementCategory(reason: string): CashMovementCategory {
  return patterns.find(([, pattern]) => pattern.test(reason))?.[0] ?? "MANUAL";
}

/** Vuelto entregado y no revertido: lo que hay que descontar de lo cobrado. */
export function saleChangeMinor(
  movements: { reason: string; amountMinor: bigint }[],
): bigint {
  return movements.reduce((sum, movement) => {
    const category = cashMovementCategory(movement.reason);
    if (category === "SALE_CHANGE") return sum + movement.amountMinor;
    if (category === "SALE_CHANGE_REVERSAL") return sum - movement.amountMinor;
    return sum;
  }, 0n);
}

export function formatCashMinor(value: bigint): string {
  const amount = value < 0n ? -value : value;
  const cents = String(amount % 100n).padStart(2, "0");
  const pesos = String(amount / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${value < 0n ? "-" : ""}$ ${pesos},${cents}`;
}
