const DAY_MS = 24 * 60 * 60 * 1000;

export type LedgerCharge = {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: bigint;
  waived: boolean;
};

export type LedgerPayment = {
  amountMinor: bigint;
  voided: boolean;
};

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Fecha a `months` meses del ancla, sin correrse: un ancla el 31 cae el 28 en febrero
 * y vuelve al 31 en marzo, porque siempre se cuenta desde el ancla y no desde el mes anterior.
 */
export function addMonthsFromAnchor(anchor: string, months: number): string {
  const [year, month, day] = anchor.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0));
  const target = new Date(
    Date.UTC(year, month - 1 + months, Math.min(day, lastDay.getUTCDate())),
  );
  return target.toISOString().slice(0, 10);
}

/** Período mensual número `index`: termina el día anterior a que empiece el siguiente. */
export function chargePeriod(anchor: string, index: number) {
  return {
    periodStart: addMonthsFromAnchor(anchor, index),
    periodEnd: addDays(addMonthsFromAnchor(anchor, index + 1), -1),
  };
}

/**
 * Una bloqueada deja de acumular deuda. Si además saldó lo que debía, los meses que pasó
 * sin servicio se condonan y el mes en curso se cobra: sin esto quedaría bloqueada para
 * siempre, con saldo cero y sin nada que pagar. La primera deuda siempre se genera.
 */
export function nextChargeAction(input: {
  blocked: boolean;
  hasCharges: boolean;
  balanceMinor: bigint;
  periodEnd: string;
  today: string;
}): "CHARGE" | "WAIVE" | "STOP" {
  if (!input.blocked || !input.hasCharges) return "CHARGE";
  if (input.balanceMinor > 0n) return "STOP";
  return input.periodEnd < input.today ? "WAIVE" : "CHARGE";
}

/**
 * Reparte los pagos vigentes del cargo más viejo al más nuevo. Se calcula siempre desde
 * cero: anular un pago no necesita deshacer nada, y `paidThrough` nunca se incrementa
 * a mano, así que no puede desincronizarse.
 */
export function settleLedger(
  charges: readonly LedgerCharge[],
  payments: readonly LedgerPayment[],
) {
  let available = payments
    .filter(({ voided }) => !voided)
    .reduce((sum, { amountMinor }) => sum + amountMinor, 0n);
  const ordered = [...charges].sort((first, second) =>
    first.periodStart.localeCompare(second.periodStart),
  );
  const settled = ordered.map((charge) => {
    if (charge.waived) return { ...charge, paidMinor: 0n, balanceMinor: 0n };
    const paidMinor =
      available < charge.amountMinor ? available : charge.amountMinor;
    available -= paidMinor;
    return {
      ...charge,
      paidMinor,
      balanceMinor: charge.amountMinor - paidMinor,
    };
  });
  // Cubre hasta el primer período con saldo: uno pago después de uno impago no cuenta.
  let paidThrough: string | null = null;
  for (const charge of settled) {
    if (charge.balanceMinor > 0n) break;
    paidThrough = charge.periodEnd;
  }
  return {
    charges: settled,
    balanceMinor: settled.reduce(
      (sum, { balanceMinor }) => sum + balanceMinor,
      0n,
    ),
    creditMinor: available,
    paidThrough,
  };
}
