/** Empty/invalid counts are not zero. Accept at most two decimal places. */
export function cashCountMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

/** Importe de MoneyInput: los puntos son de miles y la coma separa centavos. */
export function typedCashMinor(value: string): number | null {
  return cashCountMinor(value.replace(/\./g, "").replace(/,$/, ""));
}
