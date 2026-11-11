import type { UserListItem } from "./api";

/**
 * Reglas de la pantalla de Usuarios sobre el rol de dueño. Son sólo una ayuda
 * visual: la API rechaza igual cualquier cambio no permitido (SISTEMA-90).
 */
export function esDueno(item: Pick<UserListItem, "roles" | "active">) {
  return item.active && item.roles.some(({ role }) => role.code === "OWNER");
}

/** ¿Quien usa el sistema es dueño de la farmacia? */
export function soyDueno(users: readonly UserListItem[]): boolean {
  const yo = users.find(({ isCurrentUser }) => isCurrentUser);
  return yo ? esDueno(yo) : false;
}

/**
 * Sólo un dueño puede dar o quitar el rol de dueño y cambiar los roles,
 * sucursales, estado o contraseña de otro dueño.
 */
export function bloqueoDeDueno(
  users: readonly UserListItem[],
  editando: UserListItem | undefined,
): { accesoBloqueado: boolean; rolDuenoBloqueado: boolean } {
  const actorDueno = soyDueno(users);
  return {
    accesoBloqueado: !actorDueno && Boolean(editando && esDueno(editando)),
    rolDuenoBloqueado: !actorDueno,
  };
}
