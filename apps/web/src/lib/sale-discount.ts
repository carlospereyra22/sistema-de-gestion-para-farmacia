export function distributeSaleDiscount<T extends { discountMinor: number }>(
  lines: readonly T[],
  discountMinor: number,
  subtotalOf: (line: T) => number,
): T[] {
  const subtotals = lines.map(subtotalOf);
  const subtotal = subtotals.reduce((sum, value) => sum + value, 0);
  if (
    !Number.isSafeInteger(discountMinor) ||
    discountMinor < 0 ||
    discountMinor > subtotal
  )
    throw new Error("Descuento inválido.");
  let cumulative = 0n;
  let assigned = 0n;
  return lines.map((line, index) => {
    cumulative += BigInt(subtotals[index]!);
    const target =
      subtotal === 0
        ? 0n
        : (cumulative * BigInt(discountMinor)) / BigInt(subtotal);
    const amount = Number(target - assigned);
    assigned = target;
    return { ...line, discountMinor: amount };
  });
}
