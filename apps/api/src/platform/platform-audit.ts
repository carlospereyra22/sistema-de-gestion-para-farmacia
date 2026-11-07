import type { Prisma } from "@prisma/client";

/** Auditoría del panel: `AuditLog` exige una farmacia y acá muchas acciones no la tienen. */
export function recordPlatformAudit(
  client: Pick<Prisma.TransactionClient, "platformAuditLog">,
  entry: Prisma.PlatformAuditLogUncheckedCreateInput,
) {
  return client.platformAuditLog.create({ data: entry });
}
