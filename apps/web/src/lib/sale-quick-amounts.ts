// Vista previa del cobro en efectivo: el backend sigue validando pagos y vuelto.
const ROUNDING_STEPS_MINOR = [1_000, 5_000, 10_000, 20_000, 50_000].map(
  (pesos) => pesos * 100,
);
const MAX_QUICK_AMOUNTS = 4;

export function quickCashAmounts(dueMinor: number): number[] {
  if (!Number.isSafeInteger(dueMinor) || dueMinor <= 0) return [];
  const amounts = [dueMinor];
  for (const step of ROUNDING_STEPS_MINOR) {
    const rounded = Math.ceil(dueMinor / step) * step;
    if (!amounts.includes(rounded)) amounts.push(rounded);
    if (amounts.length === MAX_QUICK_AMOUNTS) break;
  }
  return amounts;
}

export function changeMinor(receivedMinor: number, dueMinor: number): number {
  return Math.max(receivedMinor - dueMinor, 0);
}
