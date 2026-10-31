import type { Prisma } from "@prisma/client";
import { readAllocations } from "./item-allocations";

export type SaleAccountMovement = {
  id: string;
  saleId: string | null;
  type: "DEBIT" | "CREDIT";
  amountMinor: bigint;
  allocations: Prisma.JsonValue | null;
  createdAt: Date;
  note: string | null;
  actorId: string | null;
  paymentMethod: string | null;
};
export function saleAccountHistory(
  saleId: string,
  itemIds: string[],
  movements: SaleAccountMovement[],
  dueDate: Date | null,
  now: Date,
  reliable: boolean,
) {
  const ids = new Set(itemIds);
  const entries = movements
    .flatMap((m) => {
      if (m.saleId === saleId) return [{ ...m, appliedMinor: m.amountMinor }];
      if (m.type !== "CREDIT" || m.saleId) return [];
      const appliedMinor = readAllocations(m.allocations)
        .filter(
          (a) =>
            ids.has(a.saleItemId) &&
            Number.isSafeInteger(a.amountMinor) &&
            a.amountMinor > 0,
        )
        .reduce((sum, a) => sum + BigInt(a.amountMinor), 0n);
      return appliedMinor > 0n ? [{ ...m, appliedMinor }] : [];
    })
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  let balance = 0n;
  const events = entries.map((m) => {
    const before = balance;
    balance += m.type === "DEBIT" ? m.appliedMinor : -m.appliedMinor;
    return {
      id: m.id,
      at: m.createdAt.toISOString(),
      title:
        m.type === "DEBIT"
          ? m.allocations &&
            typeof m.allocations === "object" &&
            !Array.isArray(m.allocations) &&
            ["PRICE_ADJUSTMENT", "MANUAL_DEBT_ADJUSTMENT"].includes(
              String(m.allocations.kind),
            )
            ? "Actualización del saldo"
            : "Venta a cuenta corriente"
          : m.saleId
            ? m.allocations &&
              typeof m.allocations === "object" &&
              !Array.isArray(m.allocations) &&
              m.allocations.kind === "MANUAL_DEBT_ADJUSTMENT"
              ? "Reducción del saldo al cobrar"
              : "Compensación de la venta"
            : "Cobro aplicado",
      detail: m.note,
      actorId: m.actorId,
      amountMinor: m.appliedMinor.toString(),
      kind: m.type === "DEBIT" ? "debit" : m.saleId ? "reversal" : "payment",
      calculated: false,
      settled: reliable && !m.saleId && before > 0n && balance <= 0n,
    };
  });
  if (dueDate && reliable) {
    const lateAt = new Date(dueDate.getTime() + 86400000 + 3 * 3600000);
    const atDue = entries
      .filter((m) => m.createdAt < lateAt)
      .reduce(
        (sum, m) =>
          sum + (m.type === "DEBIT" ? m.appliedMinor : -m.appliedMinor),
        0n,
      );
    if (lateAt <= now && atDue > 0n)
      events.push({
        id: "due",
        at: lateAt.toISOString(),
        title: "Vencimiento alcanzado",
        detail:
          "Hito calculado desde la fecha de vencimiento y las asignaciones disponibles; no es un movimiento registrado.",
        actorId: null,
        amountMinor: atDue.toString(),
        kind: "due",
        calculated: true,
        settled: false,
      });
  }
  return {
    events: events.sort(
      (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
    ),
    receipts: entries
      .filter((m) => m.type === "CREDIT" && !m.saleId)
      .map((m) => ({
        id: m.id,
        at: m.createdAt.toISOString(),
        method: m.paymentMethod,
        amountMinor: m.appliedMinor.toString(),
        receiptTotalMinor: m.amountMinor.toString(),
        note: m.note,
        actorId: m.actorId,
      })),
  };
}
