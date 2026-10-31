import type { Prisma } from "@prisma/client";

/** All writers and close use the same row lock before checking session state. */
export async function lockCashSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
) {
  await tx.$queryRaw`SELECT id FROM "CashSession" WHERE id=${sessionId}::uuid FOR UPDATE`;
}
