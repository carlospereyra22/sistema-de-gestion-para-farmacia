import type { Prisma } from "@prisma/client";

/**
 * Sesión que el usuario ya tiene abierta en la organización. El bloqueo de la
 * caja no alcanza: dos aperturas del mismo usuario en cajas distintas toman
 * filas diferentes, por eso se serializan sobre su membresía.
 */
export async function findOwnOpenSession(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT id FROM "UserOrganization" WHERE "userId"=${actorId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRaw<
    { registerName: string; branchName: string }[]
  >`SELECT r."name" AS "registerName", b."name" AS "branchName"
    FROM "CashSession" s
    JOIN "CashRegister" r ON r."id" = s."cashRegisterId"
    JOIN "Branch" b ON b."id" = r."branchId"
    WHERE s."openedById" = ${actorId}::uuid
      AND s."closedAt" IS NULL
      AND s."archivedAt" IS NULL
      AND b."organizationId" = ${organizationId}::uuid
    ORDER BY s."openedAt" DESC
    LIMIT 1`;
  return rows[0] ?? null;
}
