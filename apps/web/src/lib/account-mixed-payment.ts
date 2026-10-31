import { parseAccountDelivery } from "./account-delivery";
export type ReceiptMethod = "CASH" | "CARD" | "TRANSFER";
export type MixedDraft = Record<ReceiptMethod, string>;
export function mixedReceiptPayments(draft: MixedDraft) {
  const result: { method: ReceiptMethod; amountMinor: number }[] = [];
  for (const method of ["CASH", "CARD", "TRANSFER"] as const) {
    const value = draft[method].trim();
    if (!value || /^0+([.,]0{1,2})?$/.test(value)) continue;
    const amountMinor = parseAccountDelivery(value);
    if (amountMinor === null) return null;
    result.push({ method, amountMinor });
  }
  return result.reduce((sum, part) => sum + BigInt(part.amountMinor), 0n) <=
    BigInt(Number.MAX_SAFE_INTEGER)
    ? result
    : null;
}
