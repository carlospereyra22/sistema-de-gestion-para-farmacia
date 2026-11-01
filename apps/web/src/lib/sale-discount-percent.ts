import { parseDiscountDraft } from "./discount-editor";

// El backend sigue recibiendo un importe: el porcentaje solo se convierte en la web.
export function percentToDiscountMinor(
  percent: string,
  subtotalMinor: number,
): number | undefined {
  // parseDiscountDraft devuelve centesimos: 12,5 % -> 1250.
  const hundredths = parseDiscountDraft(percent);
  if (
    hundredths === undefined ||
    hundredths > 10_000 ||
    !Number.isSafeInteger(subtotalMinor) ||
    subtotalMinor < 0
  )
    return undefined;
  return Number(
    (BigInt(subtotalMinor) * BigInt(hundredths) + 5_000n) / 10_000n,
  );
}
