const administratorRoleCodes = new Set(["OWNER", "ADMIN"]);

/** El dueño administra su farmacia sin necesitar además el rol ADMIN. */
export function isOrganizationAdministrator(
  roles: readonly { role: { code: string } }[],
) {
  return roles.some(({ role }) => administratorRoleCodes.has(role.code));
}
