export function conceptMaximumQuantity(unitPriceMinor: number): number {
  return unitPriceMinor > 0
    ? Math.min(2147483647, Math.floor(Number.MAX_SAFE_INTEGER / unitPriceMinor))
    : 0;
}

export function parseConceptAmount(value: string): number | undefined {
  if (!/^\d+(?:,\d{1,2})?$/.test(value.trim())) return undefined;
  const amount = Math.round(Number(value.trim().replace(",", ".")) * 100);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647
    ? amount
    : undefined;
}
