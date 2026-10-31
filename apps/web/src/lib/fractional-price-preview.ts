import { parsePrice } from "./price-lists-api";

// Display-only calculation. The API validates and calculates the persisted price.
export function fractionalPricePreview(
  base: string | null,
  divisor: string,
  markup: string,
): string | null {
  const parsedMarkup = parsePrice(markup);
  if (
    !base ||
    !/^\d{1,12}$/.test(base) ||
    !/^\d+$/.test(divisor) ||
    parsedMarkup === null
  )
    return null;
  const parts = Number(divisor);
  if (
    !Number.isSafeInteger(parts) ||
    parts < 1 ||
    parts > 1000000 ||
    Number(parsedMarkup) > 1000000
  )
    return null;
  const denominator = BigInt(parts) * 10000n;
  const result =
    (BigInt(base) * (10000n + BigInt(parsedMarkup)) + denominator / 2n) /
    denominator;
  return result <= 999999999999n ? result.toString() : null;
}
