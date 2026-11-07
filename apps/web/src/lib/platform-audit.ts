const actionLabels: Record<string, string> = {
  PLATFORM_ADMIN_GRANTED: "Cuenta de plataforma creada",
  PLATFORM_ADMIN_REVOKED: "Cuenta de plataforma revocada",
  PLATFORM_TOTP_ENROLLED: "Código configurado",
  PLATFORM_TOTP_VERIFIED: "Ingreso con código",
  PLATFORM_TOTP_FAILED: "Código incorrecto",
  PLATFORM_TOTP_LOCKED: "Código bloqueado por intentos",
  PLATFORM_TOTP_RESET: "Código reseteado",
  PLATFORM_ORGANIZATION_CREATED: "Farmacia creada",
  PLATFORM_USER_CREATED: "Usuario creado",
  PLATFORM_BRANCH_CREATED: "Sucursal creada",
  PLATFORM_PASSWORD_RESET: "Clave reseteada",
  PLATFORM_SUBSCRIPTION_UPDATED: "Plan de una farmacia actualizado",
  PLATFORM_PLAN_UPDATED: "Precios actualizados",
  PLATFORM_PAYMENT_REGISTERED: "Pago registrado",
  PLATFORM_PAYMENT_VOIDED: "Pago anulado",
  PLATFORM_CHARGE_WAIVED: "Cargo condonado",
  PLATFORM_EXTENSION_GRANTED: "Prórroga otorgada",
  PLATFORM_EXTENSION_REMOVED: "Prórroga quitada",
};

export function platformActionLabel(action: string): string {
  return actionLabels[action] ?? action;
}

/** Los comandos de servidor no tienen un usuario detrás. */
export function platformActorLabel(actorEmail: string | null): string {
  return actorEmail ?? "Comando del servidor";
}

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function platformDateLabel(value: string): string {
  return dateFormat.format(new Date(value));
}
