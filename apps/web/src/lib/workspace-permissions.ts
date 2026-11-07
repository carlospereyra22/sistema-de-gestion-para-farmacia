import type { AdministrationTab, WorkspaceView } from "./workspace-location";

/**
 * Permiso que habilita cada pantalla: alcanza con tener uno. Son los mismos que pide la API
 * al cargarla, así nadie ve una pantalla que después le responde que no tiene permiso.
 * Categorías y Listas de precios son para administrar: el mostrador ve precios al vender.
 */
const viewPermissions: Partial<Record<WorkspaceView, readonly string[]>> = {
  Ventas: ["SALE_READ"],
  Productos: ["CATALOG_READ"],
  "Categorías y laboratorios": ["CATALOG_MANAGE"],
  "Listas de precios": ["CATALOG_MANAGE"],
  Inventario: ["INVENTORY_READ"],
  Caja: ["CASH_READ"],
  Compras: ["PURCHASE_READ", "PURCHASE_RECEIVE"],
  Transferencias: ["INVENTORY_MANAGE"],
  Reportes: ["REPORT_READ"],
  Clientes: ["PARTY_READ"],
  "Cuentas corrientes": ["ACCOUNT_READ"],
  "Cuentas por pagar": ["PAYABLE_READ"],
  Proveedores: ["PARTY_READ"],
  Administración: ["USER_READ", "ROLE_READ"],
  Organización: ["ORGANIZATION_READ"],
};

const administrationPermissions: Record<AdministrationTab, string> = {
  users: "USER_READ",
  roles: "ROLE_READ",
};

export function canOpenView(
  view: WorkspaceView,
  permissionCodes: readonly string[],
): boolean {
  const required = viewPermissions[view];
  return !required || required.some((code) => permissionCodes.includes(code));
}

export const canOpenAdministrationTab = (
  tab: AdministrationTab,
  permissionCodes: readonly string[],
) => permissionCodes.includes(administrationPermissions[tab]);
