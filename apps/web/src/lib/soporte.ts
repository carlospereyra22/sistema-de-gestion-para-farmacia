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

const CLAVE_SESION_ABIERTA = "plataforma:soporte-abierta";

/**
 * La sesión de soporte no vence sola (dura hasta volver al panel). Si se cierra
 * la pestaña estando adentro, el id queda guardado y el panel la corta la
 * próxima vez que se abre.
 */
export function recordarSesionDeSoporte(sessionId: string) {
  try {
    window.localStorage.setItem(CLAVE_SESION_ABIERTA, sessionId);
  } catch {
    /* Sin almacenamiento la sesión vence sola por el tope del servidor. */
  }
}

export function olvidarSesionDeSoporte() {
  try {
    window.localStorage.removeItem(CLAVE_SESION_ABIERTA);
  } catch {
    /* Nada que olvidar. */
  }
}

export function sesionDeSoporteSinCerrar(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_SESION_ABIERTA);
  } catch {
    return null;
  }
}
