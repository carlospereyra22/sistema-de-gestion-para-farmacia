import type { CashClosure } from "./api";

export function cashResponsibleLabel(
  closure: Pick<CashClosure, "closedBy" | "registerResponsibleName">,
): string {
  if (closure.registerResponsibleName) return closure.registerResponsibleName;
  if (!closure.closedBy) return "No registrado";
  return /^Usuario [a-f0-9]{8}$/i.test(closure.closedBy)
    ? "Usuario sin nombre configurado"
    : closure.closedBy;
}
