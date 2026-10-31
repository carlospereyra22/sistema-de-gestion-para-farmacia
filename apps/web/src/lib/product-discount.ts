import { parseDiscountDraft } from "./discount-editor";
export type ProductDiscountMode = "percent" | "amount";
export function discountedUnitPrice(
  base: number,
  draft: string,
  mode: ProductDiscountMode,
): number | undefined {
  const value = parseDiscountDraft(draft);
  if (!Number.isSafeInteger(base) || base < 0 || value === undefined)
    return undefined;
  if (mode === "amount") return value <= base ? base - value : undefined;
  if (value > 10000) return undefined;
  return Number((BigInt(base) * BigInt(10000 - value) + 5000n) / 10000n);
}
export function productDiscountDraft(
  base: number,
  price: number,
  mode: ProductDiscountMode,
): string {
  const value =
    mode === "amount"
      ? (base - price) / 100
      : base
        ? ((base - price) * 100) / base
        : 0;
  return value === 0
    ? ""
    : value.toFixed(2).replace(/\.00$/, "").replace(".", ",");
}
