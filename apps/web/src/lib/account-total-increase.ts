import { parseAccountDelivery } from "./account-delivery";

export function accountTotalIncrease(
  current: number,
  mode: "amount" | "percent",
  value: string,
): number | null {
  if (!Number.isSafeInteger(current) || current <= 0) return null;
  const parsed = parseAccountDelivery(value);
  if (parsed === null) return null;
  const next =
    mode === "amount"
      ? BigInt(parsed)
      : BigInt(current) + (BigInt(current) * BigInt(parsed) + 5000n) / 10000n;
  return next > BigInt(current) && next <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(next)
    : null;
}
