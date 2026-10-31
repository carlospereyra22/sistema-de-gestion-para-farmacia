import type { CustomerAccount } from "./api";
export type AccountHistoryFilter = "all" | "sales" | "receipts";
export function filterAccountHistory(
  movements: CustomerAccount["movements"],
  filter: AccountHistoryFilter,
) {
  return movements.filter(
    (movement) =>
      filter === "all" ||
      (filter === "receipts"
        ? movement.type === "CREDIT" && !movement.saleId
        : movement.type === "DEBIT" &&
          Boolean(movement.saleId) &&
          !movement.isPriceAdjustment &&
          !movement.isDebtAdjustment),
  );
}
