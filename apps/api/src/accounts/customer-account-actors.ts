type ActorAudit = {
  entityId: string | null;
  actorId: string | null;
  action: string;
  before: unknown;
  after: unknown;
};
export type CustomerAccountActors = {
  createdById: string | null;
  creditEnabledById: string | null;
};

const enabledIn = (snapshot: unknown) =>
  typeof snapshot === "object" && snapshot !== null && "enabled" in snapshot
    ? snapshot.enabled === true
    : false;

/**
 * Lee quién creó cada cliente y quién habilitó su crédito desde la auditoría,
 * que debe llegar en orden cronológico. Son eventos separados, así que pueden
 * ser usuarios distintos. Reconfigurar un crédito ya activo no cambia quién lo
 * habilitó; deshabilitarlo lo olvida y cuenta el próximo que lo habilite.
 */
export function customerAccountActors(audits: ActorAudit[]) {
  const actors = new Map<string, CustomerAccountActors>();
  for (const audit of audits) {
    if (!audit.entityId) continue;
    const current = actors.get(audit.entityId) ?? {
      createdById: null,
      creditEnabledById: null,
    };
    if (audit.action === "CUSTOMER_CREATED")
      current.createdById = audit.actorId;
    if (audit.action === "CREDIT_CONFIGURED") {
      if (!enabledIn(audit.after)) current.creditEnabledById = null;
      else if (!enabledIn(audit.before))
        current.creditEnabledById = audit.actorId;
    }
    actors.set(audit.entityId, current);
  }
  return actors;
}
