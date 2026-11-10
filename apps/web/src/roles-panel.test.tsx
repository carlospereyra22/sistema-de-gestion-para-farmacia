import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoleListItem } from "./lib/api";
import { RoleCard, RolesPanel } from "./roles-panel";

const role = (
  code: string,
  permissions: string[],
  extra: Partial<RoleListItem> = {},
): RoleListItem => ({
  id: `${code}-id`,
  code,
  name: code === "OWNER" ? "Owner" : "Cajero",
  permissions: permissions.map((permission) => ({
    permission: { code: permission },
  })),
  ...extra,
});

describe("tarjeta de rol", () => {
  it("muestra usuarios, descripción y los primeros módulos con el resto resumido", () => {
    const html = renderToStaticMarkup(
      <RoleCard
        role={role(
          "CAJERO",
          ["SALE_READ", "CATALOG_READ", "CASH_READ", "PARTY_READ"],
          { userCount: 1, description: "Cobra en mostrador" },
        )}
        selected
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain("1 usuario");
    expect(html).toContain("Cobra en mostrador");
    expect(html).toContain("Ventas");
    expect(html).toContain("+ 2 más");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Editando");
    expect(html).toContain("Editar rol Cajero");
  });

  it("avisa cuando el rol no tiene permisos", () => {
    const html = renderToStaticMarkup(
      <RoleCard
        role={role("CAJERO", [], { userCount: 3 })}
        selected={false}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain("3 usuarios");
    expect(html).toContain("Sin permisos asignados.");
    expect(html).toContain("Sin descripción.");
    expect(html).toContain("Editar rol");
  });
});

describe("panel de roles", () => {
  it("arranca con el formulario de rol nuevo y el contador de permisos en cero", () => {
    const html = renderToStaticMarkup(
      <RolesPanel
        token="t"
        organizationId="o"
        roles={[role("OWNER", ["SALE_READ"])]}
        onDone={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(html).toContain("Roles del sistema");
    // Con el formulario de rol nuevo abierto no se repite el botón Nuevo rol.
    expect(html).not.toContain("lucide-plus");
    expect(html).toContain("Ver rol");
    expect(html).toContain("0 de 28 permisos");
    expect(html).toContain("Crear rol");
    expect(html).toContain('aria-label="Código del rol"');
  });
});
