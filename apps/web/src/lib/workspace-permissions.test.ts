import { describe, expect, it } from "vitest";
import { canOpenAdministrationTab, canOpenView } from "./workspace-permissions";

/** Los permisos del rol Empleado que crea el alta de una farmacia. */
const employee = [
  "SALE_READ",
  "SALE_MANAGE",
  "CASH_READ",
  "CASH_MANAGE",
  "CATALOG_READ",
  "INVENTORY_READ",
  "PARTY_READ",
  "ACCOUNT_READ",
];

describe("pantallas según el rol", () => {
  it("el empleado ve lo del mostrador", () => {
    for (const view of [
      "Inicio",
      "Ventas",
      "Productos",
      "Inventario",
      "Caja",
      "Clientes",
      "Cuentas corrientes",
    ] as const)
      expect(canOpenView(view, employee)).toBe(true);
  });

  it("el empleado no ve lo que la API le rechazaría", () => {
    for (const view of [
      "Categorías y laboratorios",
      "Listas de precios",
      "Compras",
      "Transferencias",
      "Reportes",
      "Cuentas por pagar",
      "Administración",
      "Organización",
    ] as const)
      expect(canOpenView(view, employee)).toBe(false);
  });

  it("quien solo recibe mercadería entra a Compras", () => {
    expect(canOpenView("Compras", ["PURCHASE_RECEIVE"])).toBe(true);
  });

  it("Inicio lo ve cualquiera, aunque no tenga permisos", () => {
    expect(canOpenView("Inicio", [])).toBe(true);
  });

  it("Administración se abre con usuarios o con roles", () => {
    expect(canOpenView("Administración", ["ROLE_READ"])).toBe(true);
    expect(canOpenAdministrationTab("users", ["ROLE_READ"])).toBe(false);
    expect(canOpenAdministrationTab("roles", ["ROLE_READ"])).toBe(true);
  });
});
