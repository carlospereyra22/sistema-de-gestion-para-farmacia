import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { contractedQuota } from "./subscription-fee";

export type QuotaResource = "users" | "branches";

const nouns: Record<QuotaResource, readonly [string, string]> = {
  users: ["usuario", "usuarios"],
  branches: ["sucursal", "sucursales"],
};

/**
 * Se llama dentro de la transacción, antes de escribir. El bloqueo impide que dos altas
 * simultáneas pasen con el último lugar. Va sobre la suscripción y no sobre `Organization`
 * porque ese bloqueo frenaría toda escritura con clave foránea a la farmacia.
 *
 * Quien además bloquee `Organization` tiene que llamar a esta función primero: un alta toma
 * la suscripción y después necesita la organización, y el orden inverso podría trabarse.
 *
 * Sin suscripción no hay cupo que aplicar: un dato faltante no puede frenar a nadie.
 */
export async function assertQuotaAvailable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resource: QuotaResource,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "OrganizationSubscription"
    WHERE "organizationId"=${organizationId}::uuid FOR UPDATE`;
  if (!locked.length) return;
  const subscription = await tx.organizationSubscription.findUniqueOrThrow({
    where: { organizationId },
    include: { plan: true },
  });
  if (subscription.exempt) return;
  const quota = contractedQuota(subscription.plan, subscription)[resource];
  const used =
    resource === "users"
      ? await tx.userOrganization.count({
          where: { organizationId, active: true },
        })
      : await tx.branch.count({
          where: { organizationId, active: true, deletedAt: null },
        });
  if (used >= quota)
    throw new ConflictException(
      `La farmacia llegó al límite de ${quota} ${nouns[resource][quota === 1 ? 0 : 1]} de su plan. Para sumar más hay que ampliar el plan.`,
    );
}
