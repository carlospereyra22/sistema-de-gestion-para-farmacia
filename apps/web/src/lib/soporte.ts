import type { CurrentUserProfile } from "./api";

/** Lo que la app necesita del perfil para mostrarse como ese usuario. */
export function datosDelPerfil(profile: CurrentUserProfile) {
  const membership = profile.organizations[0];
  return {
    email: profile.email,
    organizationId: membership?.organizationId,
    displayName: membership?.displayName || undefined,
    organizationName:
      membership?.organization?.ticketHeader?.name ||
      membership?.organization?.name,
    permissionCodes:
      membership?.roles?.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.code),
      ) ?? [],
  };
}

/** Milisegundos hasta que vence la sesión de soporte (nunca negativo). */
export const msHastaVencer = (expiresAt: string, ahora = Date.now()) =>
  Math.max(0, Date.parse(expiresAt) - ahora);
