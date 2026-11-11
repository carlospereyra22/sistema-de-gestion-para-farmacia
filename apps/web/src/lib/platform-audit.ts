const actionLabels: Record<string, string> = {
  PLATFORM_ADMIN_GRANTED: "Cuenta de plataforma creada",
  SOPORTE_ENTRO: "Entró como usuario (soporte)",
  SOPORTE_SALIO: "Volvió al panel (soporte)",
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
  PADRON_CERTIFICADO_SOLICITUD: "Solicitud de certificado del padrón de ARCA",
  PADRON_CERTIFICADO_CARGADO: "Certificado del padrón de ARCA cargado",
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

/** Tipos de registro, para filtrar la auditoría. */
export type PlatformAuditGroup =
  "soporte" | "cobros" | "farmacias" | "accesos" | "arca";

export const platformAuditGroups: { value: string; label: string }[] = [
  { value: "ALL", label: "Todos los registros" },
  { value: "soporte", label: "Soporte" },
  { value: "cobros", label: "Cobros y planes" },
  { value: "farmacias", label: "Farmacias y usuarios" },
  { value: "accesos", label: "Accesos al panel" },
  { value: "arca", label: "ARCA" },
];

export function platformAuditGroup(action: string): PlatformAuditGroup {
  if (action.startsWith("SOPORTE_")) return "soporte";
  if (action.startsWith("PADRON_")) return "arca";
  if (/PAYMENT|CHARGE|EXTENSION|PLAN_UPDATED|SUBSCRIPTION/.test(action))
    return "cobros";
  if (/TOTP|PLATFORM_ADMIN/.test(action)) return "accesos";
  return "farmacias";
}

/** En soporte, a qué usuario se entró: queda en `after.email`. */
export function platformAuditDetail(entry: {
  action: string;
  after?: unknown;
}): string | undefined {
  if (!entry.action.startsWith("SOPORTE_")) return undefined;
  const after = entry.after;
  if (after && typeof after === "object" && "email" in after) {
    const email = (after as { email: unknown }).email;
    if (typeof email === "string") return `Como ${email}`;
  }
  return undefined;
}
