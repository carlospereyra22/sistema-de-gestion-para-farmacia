export function parseSaleQuantity(
  value: string,
  maximum: number,
): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= maximum
    ? quantity
    : null;
}
export function isQuantityScannerBurst(
  scan: { text: string; start: number; last: number },
  now: number,
) {
  return (
    scan.text.length >= 8 &&
    now - scan.last < 100 &&
    (scan.last - scan.start) / (scan.text.length - 1) < 40
  );
}
