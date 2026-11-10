import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UserCreateOptions, UserListItem } from "./lib/api";
import { UserCard, UsersPanel } from "./users-panel";

const item = (extra: Partial<UserListItem> = {}): UserListItem => ({
  displayName: "Ana Gómez",
  active: true,
  user: { id: "u1", email: "ana@example.com", active: true },
  roles: [{ role: { id: "r1", code: "CAJERO", name: "Cajero" } }],
  branches: [{ branch: { id: "b1", name: "Centro" } }],
  ...extra,
});

const options: UserCreateOptions = {
  roles: [
    { id: "r1", code: "CAJERO", name: "Cajero" },
    { id: "r2", code: "ADMIN", name: "Administrador" },
  ],
  branches: [{ id: "b1", code: "CEN", name: "Centro" }],
};

describe("tarjeta de usuario", () => {
  it("muestra iniciales, roles por nombre, sucursales y la acción de editar", () => {
    const html = renderToStaticMarkup(
      <UserCard item={item()} selected={false} onSelect={() => undefined} />,
    );
    expect(html).toContain("AG");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("Cajero");
    expect(html).toContain("Centro");
    expect(html).toContain("Activo");
    expect(html).toContain("Editar usuario");
  });

  it("marca al usuario propio y al inactivo", () => {
    const html = renderToStaticMarkup(
      <UserCard
        item={item({ isCurrentUser: true, active: false })}
        selected
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain("Vos");
    expect(html).toContain("Inactivo");
    expect(html).toContain("Editando");
  });
});

describe("panel de usuarios", () => {
  it("arranca con el alta: contraseña, roles y sucursales para elegir, sin botón Nuevo usuario", () => {
    const html = renderToStaticMarkup(
      <UsersPanel
        token="t"
        organizationId="o"
        users={[item()]}
        options={options}
        onDone={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(html).toContain("Usuarios de la farmacia");
    expect(html).not.toContain("lucide-plus");
    expect(html).toContain('aria-label="Contraseña del usuario"');
    expect(html).toContain("Administrador");
    expect(html).toContain("0 de 2");
    expect(html).toContain("Crear usuario");
  });
});
