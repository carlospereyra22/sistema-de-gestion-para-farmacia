import { inputMinor } from "./api";
export type ReceiptDebtDraft = {
  enabled: boolean;
  amount?: string;
  dueOn: string;
};
export function suggestedDebt(
  supplier?: { accountEnabled?: boolean; accountTermDays?: number | null },
  now = new Date(),
): ReceiptDebtDraft {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const today = ["year", "month", "day"]
    .map((t) => parts.find((p) => p.type === t)!.value)
    .join("-");
  return {
    enabled: supplier?.accountEnabled ?? false,
    dueOn:
      supplier?.accountTermDays == null
        ? ""
        : new Date(
            new Date(`${today}T00:00:00Z`).getTime() +
              supplier.accountTermDays * 86400000,
          )
            .toISOString()
            .slice(0, 10),
  };
}
export function receiptDebtBody(
  draft: ReceiptDebtDraft | undefined,
  estimated: string,
) {
  return draft?.enabled
    ? {
        amountMinor: inputMinor(draft.amount ?? estimated),
        dueOn: draft.dueOn || null,
      }
    : undefined;
}
