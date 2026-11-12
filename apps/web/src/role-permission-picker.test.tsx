import { describe, expect, it } from "vitest";
import {
  rolePermissionLabel,
  rolePermissionModules,
  toggleRolePermission,
} from "./lib/role-permissions";

describe("permisos por módulo", () => {
  it("conserva todas las capacidades que ya ofrecía el editor", () => {
    const codes = new Set(
      rolePermissionModules.flatMap((module) =>
        module.permissions.map(({ code }) => code),
      ),
    );
    expect(codes).toEqual(
      new Set([
        "USER_READ",
        "USER_MANAGE",
        "ROLE_READ",
        "ROLE_MANAGE",
        "ORGANIZATION_READ",
        "ORGANIZATION_MANAGE",
        "CATALOG_READ",
        "CATALOG_MANAGE",
        "PARTY_READ",
        "PARTY_MANAGE",
        "INVENTORY_READ",
        "INVENTORY_MANAGE",
        "COST_READ",
        "OFFER_READ",
        "OFFER_MANAGE",
        "SALE_READ",
        "SALE_MANAGE",
        "CASH_READ",
        "CASH_MANAGE",
        "ACCOUNT_READ",
        "ACCOUNT_MANAGE",
        "REPORT_READ",
        "REPORT_PROFIT_READ",
        "REPORT_EXPORT",
        "PURCHASE_READ",
        "PURCHASE_MANAGE",
        "PURCHASE_RECEIVE",
        "PAYABLE_READ",
        "PAYABLE_MANAGE",
        "PAYABLE_PAY",
      ]),
    );
  });

  it("sincroniza los controles que representan un mismo permiso", () => {
    const categories = rolePermissionModules.find(
      ({ title }) => title === "Categorías y laboratorios",
    );
    const products = rolePermissionModules.find(
      ({ title }) => title === "Productos",
    );
    expect(categories?.permissions[0].code).toBe("CATALOG_MANAGE");
    expect(products?.permissions[1].code).toBe("CATALOG_MANAGE");
    expect(
      toggleRolePermission(["CATALOG_MANAGE"], "CATALOG_MANAGE", true),
    ).toEqual(["CATALOG_MANAGE"]);
    expect(
      toggleRolePermission(["CATALOG_MANAGE"], "CATALOG_MANAGE", false),
    ).toEqual([]);
    expect(rolePermissionLabel("CATALOG_MANAGE")).toContain("categorías");
  });
});
