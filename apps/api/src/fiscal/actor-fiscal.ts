/**
 * Actor de los envíos automáticos a ARCA (cola fiscal). No es un usuario: no
 * se chequean permisos y la auditoría queda sin actor, marcada como automática.
 * Es un símbolo para que nunca se confunda con el id de un usuario.
 */
export const PROCESO_AUTOMATICO: unique symbol = Symbol(
  "proceso-automatico-fiscal",
);

export type FiscalActor = string | typeof PROCESO_AUTOMATICO;

export function esAutomatico(
  actor: FiscalActor,
): actor is typeof PROCESO_AUTOMATICO {
  return actor === PROCESO_AUTOMATICO;
}

/** Valor de `AuditLog.actorId`: null para el proceso automático. */
export function actorAuditoria(actor: FiscalActor) {
  return esAutomatico(actor) ? null : actor;
}

/** Marca que se suma a `after` en la auditoría de un envío automático. */
export function origenAuditoria(actor: FiscalActor) {
  return esAutomatico(actor) ? { origen: "AUTOMATICO" } : {};
}
