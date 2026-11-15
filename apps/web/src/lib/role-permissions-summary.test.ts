import { describe, expect, it } from "vitest";
import {
  countRolePermissions,
  roleModuleTitles,
  rolePermissionCodes,
  suggestedRoleCode,
} from "./role-permissions";

describe("resumen de permisos de un rol", () => {
  it("cuenta cada permiso una sola vez aunque esté en varios módulos", () => {
    expect(rolePermissionCodes).toHaveLength(30);
    expect(countRolePermissions(["CATALOG_MANAGE", "CATALOG_MANAGE"])).toBe(1);
    expect(countRolePermissions(["NO_EXISTE", "SALE_READ"])).toBe(1);
  });

  it("lista los módulos habilitados en el orden del menú", () => {
    expect(roleModuleTitles(["PARTY_READ", "SALE_READ"])).toEqual([
      "Ventas",
      "Clientes",
      "Proveedores",
    ]);
    expect(roleModuleTitles([])).toEqual([]);
  });
});

describe("código sugerido para un rol nuevo", () => {
  it("pasa el nombre a mayúsculas sin tildes ni espacios", () => {
    expect(suggestedRoleCode("Cajero turno tarde")).toBe("CAJERO_TURNO_TARDE");
    expect(suggestedRoleCode("Farmacéutica")).toBe("FARMACEUTICA");
    expect(suggestedRoleCode("2 Encargado ")).toBe("ENCARGADO");
  });
});
