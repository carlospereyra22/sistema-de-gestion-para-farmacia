export const PASSWORD_MIN_LENGTH = 12;

/** Vista previa de lo que valida la API, para avisar antes de enviar. */
export function passwordChangeError({
  currentPassword,
  newPassword,
  repeat,
}: {
  currentPassword: string;
  newPassword: string;
  repeat: string;
}): string | undefined {
  if (!currentPassword) return "Ingresá tu contraseña actual.";
  if (newPassword.length < PASSWORD_MIN_LENGTH)
    return `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (newPassword !== repeat) return "Las contraseñas no coinciden.";
  if (newPassword === currentPassword)
    return "La contraseña nueva tiene que ser distinta de la actual.";
  return undefined;
}

export function passwordChangedMessage(revokedSessions: number): string {
  if (revokedSessions === 0) return "Contraseña cambiada.";
  return revokedSessions === 1
    ? "Contraseña cambiada. Se cerró tu otra sesión abierta."
    : `Contraseña cambiada. Se cerraron tus otras ${revokedSessions} sesiones abiertas.`;
}
