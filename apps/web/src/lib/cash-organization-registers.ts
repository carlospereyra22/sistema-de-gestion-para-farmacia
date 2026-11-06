import type { CashOrganizationRegister } from "./api";

export type RegisterStateFilter = "" | "open" | "closed";

export function organizationRegisterState(
  row: Pick<CashOrganizationRegister, "active" | "session">,
): "Abierta" | "Cerrada" | "Deshabilitada" {
  if (row.session) return "Abierta";
  return row.active ? "Cerrada" : "Deshabilitada";
}

/** Sin sucursal ni estado elegidos, se ven todas las cajas. */
export function filterOrganizationRegisters(
  rows: CashOrganizationRegister[],
  branchId: string,
  state: RegisterStateFilter,
): CashOrganizationRegister[] {
  return rows.filter(
    (row) =>
      (!branchId || row.branchId === branchId) &&
      (!state || Boolean(row.session) === (state === "open")),
  );
}
