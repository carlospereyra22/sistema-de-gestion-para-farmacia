import { describe, expect, it } from "vitest";
import type { UserListItem } from "./api";
import { bloqueoDeDueno, soyDueno } from "./usuarios-dueno";

const usuario = (
  id: string,
  code: string,
  extra: Partial<UserListItem> = {},
): UserListItem => ({
  active: true,
  user: { id, email: `${id}@example.com`, active: true },
  roles: [{ role: { id: `r-${code}`, code } }],
  branches: [],
  ...extra,
});

describe("rol de dueño en la pantalla de Usuarios", () => {
  const dueno = usuario("d", "OWNER");
  const admin = usuario("a", "ADMIN");

  it("reconoce si quien usa el sistema es dueño activo", () => {
    expect(soyDueno([{ ...dueno, isCurrentUser: true }, admin])).toBe(true);
    expect(soyDueno([dueno, { ...admin, isCurrentUser: true }])).toBe(false);
    expect(soyDueno([{ ...dueno, isCurrentUser: true, active: false }])).toBe(
      false,
    );
    expect(soyDueno([dueno, admin])).toBe(false);
  });

  it("un administrador que no es dueño no toca al dueño ni el rol de dueño", () => {
    const users = [dueno, { ...admin, isCurrentUser: true }];
    expect(bloqueoDeDueno(users, dueno)).toEqual({
      accesoBloqueado: true,
      rolDuenoBloqueado: true,
    });
    expect(bloqueoDeDueno(users, usuario("c", "CAJERO"))).toEqual({
      accesoBloqueado: false,
      rolDuenoBloqueado: true,
    });
    expect(bloqueoDeDueno(users, undefined).accesoBloqueado).toBe(false);
  });

  it("un dueño puede todo", () => {
    const users = [{ ...dueno, isCurrentUser: true }, admin];
    expect(bloqueoDeDueno(users, usuario("x", "OWNER"))).toEqual({
      accesoBloqueado: false,
      rolDuenoBloqueado: false,
    });
  });
});
