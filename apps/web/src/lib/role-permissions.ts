import {
  ArrowLeftRight,
  BadgePercent,
  Boxes,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  NotebookTabs,
  Package,
  ReceiptText,
  Shapes,
  ShoppingCart,
  Tags,
  Truck,
  UsersRound,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

type PermissionOption = { code: string; label: string };
type PermissionModule = {
  title: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  permissions: readonly PermissionOption[];
  description?: string;
};

const permissionModules: readonly PermissionModule[] = [
  {
    title: "Inicio",
    icon: LayoutDashboard,
    permissions: [],
    description:
      "Disponible para todos los usuarios de la organización. Cada dato se muestra según los permisos de los demás módulos.",
  },
  {
    title: "Ventas",
    icon: ShoppingCart,
    permissions: [
      { code: "SALE_READ", label: "Ver ventas e historial" },
      { code: "SALE_MANAGE", label: "Vender, anular y registrar devoluciones" },
    ],
  },
  {
    title: "Productos",
    icon: Package,
    permissions: [
      { code: "CATALOG_READ", label: "Ver y buscar productos" },
      { code: "CATALOG_MANAGE", label: "Crear y editar productos" },
      { code: "COST_READ", label: "Ver costos de productos" },
    ],
  },
  {
    title: "Categorías y laboratorios",
    icon: Shapes,
    permissions: [
      {
        code: "CATALOG_MANAGE",
        label: "Administrar categorías y laboratorios",
      },
    ],
  },
  {
    title: "Listas de precios",
    icon: Tags,
    permissions: [
      { code: "CATALOG_MANAGE", label: "Administrar listas de precios" },
    ],
  },
  {
    title: "Ofertas",
    icon: BadgePercent,
    permissions: [
      { code: "OFFER_READ", label: "Ver ofertas y sus ventas" },
      {
        code: "OFFER_MANAGE",
        label: "Crear, editar, pausar y finalizar ofertas",
      },
    ],
    description:
      "Aplicar una oferta al vender no necesita permiso: se aplica sola.",
  },
  {
    title: "Inventario",
    icon: Boxes,
    permissions: [
      { code: "INVENTORY_READ", label: "Ver y buscar stock y lotes" },
      { code: "INVENTORY_MANAGE", label: "Recibir y ajustar stock" },
      { code: "COST_READ", label: "Ver costos de productos" },
    ],
  },
  {
    title: "Caja",
    icon: Wallet,
    permissions: [
      { code: "CASH_READ", label: "Ver caja y movimientos" },
      { code: "CASH_MANAGE", label: "Abrir, cerrar y operar la caja" },
    ],
  },
  {
    title: "Compras",
    icon: ClipboardList,
    permissions: [
      { code: "PURCHASE_READ", label: "Ver compras y sus costos" },
      { code: "PURCHASE_MANAGE", label: "Crear y editar compras" },
      { code: "PURCHASE_RECEIVE", label: "Recibir mercadería" },
    ],
  },
  {
    title: "Transferencias",
    icon: ArrowLeftRight,
    permissions: [
      { code: "INVENTORY_MANAGE", label: "Preparar y recibir transferencias" },
    ],
  },
  {
    title: "Reportes",
    icon: ChartNoAxesCombined,
    permissions: [
      { code: "REPORT_READ", label: "Ver reportes" },
      { code: "REPORT_PROFIT_READ", label: "Ver costos y ganancias" },
      { code: "REPORT_EXPORT", label: "Exportar reportes" },
    ],
  },
  {
    title: "Clientes",
    icon: ContactRound,
    permissions: [
      { code: "PARTY_READ", label: "Ver y buscar clientes" },
      { code: "PARTY_MANAGE", label: "Crear y editar clientes" },
    ],
  },
  {
    title: "Cuentas corrientes",
    icon: NotebookTabs,
    permissions: [
      { code: "ACCOUNT_READ", label: "Ver cuentas corrientes" },
      { code: "ACCOUNT_MANAGE", label: "Administrar cuentas corrientes" },
    ],
  },
  {
    title: "Cuentas por pagar",
    icon: ReceiptText,
    permissions: [
      { code: "PAYABLE_READ", label: "Ver cuentas por pagar" },
      { code: "PAYABLE_MANAGE", label: "Cargar facturas de proveedores" },
      { code: "PAYABLE_PAY", label: "Registrar pagos a proveedores" },
    ],
  },
  {
    title: "Proveedores",
    icon: Truck,
    permissions: [
      { code: "PARTY_READ", label: "Ver y buscar proveedores" },
      { code: "PARTY_MANAGE", label: "Crear y editar proveedores" },
    ],
  },
  {
    title: "Usuarios",
    icon: UsersRound,
    permissions: [
      { code: "USER_READ", label: "Ver usuarios" },
      { code: "USER_MANAGE", label: "Crear y administrar usuarios" },
    ],
  },
  {
    title: "Roles y permisos",
    icon: ShieldCheck,
    permissions: [
      { code: "ROLE_READ", label: "Ver roles y permisos" },
      { code: "ROLE_MANAGE", label: "Crear y administrar roles" },
    ],
  },
  {
    title: "Organización y sucursales",
    icon: Building2,
    permissions: [
      { code: "ORGANIZATION_READ", label: "Ver organización y sucursales" },
      {
        code: "ORGANIZATION_MANAGE",
        label: "Administrar organización y sucursales",
      },
    ],
  },
];

export const modulesByCode = new Map<string, string[]>();
for (const module of permissionModules) {
  for (const permission of module.permissions) {
    modulesByCode.set(permission.code, [
      ...(modulesByCode.get(permission.code) ?? []),
      module.title,
    ]);
  }
}

export const rolePermissionModules = permissionModules;

const sharedPermissionLabels: Record<string, string> = {
  CATALOG_MANAGE: "Administrar productos, categorías y listas",
  PARTY_READ: "Ver clientes y proveedores",
  PARTY_MANAGE: "Administrar clientes y proveedores",
  INVENTORY_MANAGE: "Gestionar inventario y transferencias",
  COST_READ: "Ver costos de productos",
};

export function rolePermissionLabel(code: string): string {
  return (
    sharedPermissionLabels[code] ??
    permissionModules
      .flatMap((module) => module.permissions)
      .find((permission) => permission.code === code)?.label ??
    code
  );
}

export function toggleRolePermission(
  current: readonly string[],
  code: string,
  enabled: boolean,
): string[] {
  return enabled
    ? [...new Set([...current, code])]
    : current.filter((permission) => permission !== code);
}

/** Permisos distintos que se pueden asignar (un mismo código puede estar en varios módulos). */
export const rolePermissionCodes: readonly string[] = [
  ...new Set(
    permissionModules.flatMap((module) =>
      module.permissions.map(({ code }) => code),
    ),
  ),
];

export function countRolePermissions(codes: readonly string[]): number {
  const selected = new Set(codes);
  return rolePermissionCodes.filter((code) => selected.has(code)).length;
}

/** Módulos que el rol puede usar: los que tienen al menos un permiso elegido. */
export function roleModuleTitles(codes: readonly string[]): string[] {
  const selected = new Set(codes);
  return permissionModules
    .filter((module) =>
      module.permissions.some(({ code }) => selected.has(code)),
    )
    .map(({ title }) => title);
}

/** Sugiere un código a partir del nombre: "Cajero turno tarde" -> CAJERO_TURNO_TARDE. */
export function suggestedRoleCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^[^A-Z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 32);
}
