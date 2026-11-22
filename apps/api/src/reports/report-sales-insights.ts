import { sharePct } from "./report-math";

/**
 * Lectura rápida de la pestaña Ventas (SISTEMA-115). Funciones puras para
 * poder probarlas sin base de datos.
 */

type Amount = { amount: bigint };

/** El tramo con más facturado; ante empate, el primero. null si no hubo ventas. */
export function strongest<T extends Amount>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const row of rows)
    if (row.amount > 0n && (!best || row.amount > best.amount)) best = row;
  return best;
}

/** Facturado por día de la semana (1 = lunes … 7 = domingo) a partir del mapa de calor. */
export function byWeekday(
  cells: readonly { weekday: number; amount: bigint }[],
): { weekday: number; amount: bigint }[] {
  const totals = new Map<number, bigint>();
  for (const cell of cells)
    totals.set(cell.weekday, (totals.get(cell.weekday) ?? 0n) + cell.amount);
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    amount: totals.get(weekday) ?? 0n,
  }));
}

/** Rangos de importe de ticket, en centavos (SISTEMA-118). */
export const TICKET_SIZES = [
  { id: "5k", name: "Hasta $5.000", max: 500000n },
  { id: "10k", name: "$5.000 a $10.000", max: 1000000n },
  { id: "20k", name: "$10.000 a $20.000", max: 2000000n },
  { id: "50k", name: "$20.000 a $50.000", max: 5000000n },
  { id: "100k", name: "$50.000 a $100.000", max: 10000000n },
  { id: "more", name: "Más de $100.000", max: null },
] as const;

export function ticketSizeOf(totalMinor: bigint) {
  return TICKET_SIZES.find(
    (size) => size.max === null || totalMinor <= size.max,
  )!.id;
}

/**
 * Cuántas veces cae cada día de la semana (1 = lunes) entre dos fechas
 * civiles inclusivas: para promediar la venta de cada día.
 */
export function weekdayOccurrences(from: string, to: string) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let day = Date.parse(from); day <= Date.parse(to); day += 86400000) {
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    counts[weekday]! += 1;
  }
  return counts;
}

/** Unidades por ticket con un decimal; null sin tickets. */
export function unitsPerTicket(units: number, tickets: number): number | null {
  if (!tickets) return null;
  return Math.round((units / tickets) * 10) / 10;
}

/** Participación del mejor tramo sobre el total, para la lectura rápida. */
export function highlight<T extends Amount>(rows: readonly T[]) {
  const best = strongest(rows);
  if (!best) return null;
  const whole = rows.reduce((total, row) => total + row.amount, 0n);
  return { row: best, sharePct: sharePct(best.amount, whole) };
}
