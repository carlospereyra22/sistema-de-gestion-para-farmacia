import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const defaultCashSettings = {
  allowWithoutSession: true,
  askOpeningAmount: true,
  requireMovementReason: true,
  allowManualMovements: true,
  defaultRegisterId: null as string | null,
  version: 0,
};
export async function readCashSettings(
  tx: Pick<Prisma.TransactionClient, "cashSettings">,
  branchId: string,
) {
  const row = await tx.cashSettings.findUnique({ where: { branchId } });
  return row ? cashSettingsView(row) : { ...defaultCashSettings };
}
export function cashSettingsView(row: typeof defaultCashSettings) {
  return {
    allowWithoutSession: row.allowWithoutSession,
    askOpeningAmount: row.askOpeningAmount,
    requireMovementReason: row.requireMovementReason,
    allowManualMovements: row.allowManualMovements,
    defaultRegisterId: row.defaultRegisterId,
    version: row.version,
  };
}
export async function assertCollectionSession(
  tx: Prisma.TransactionClient,
  branchId: string,
  sessionId?: string,
  financedOnly = false,
) {
  const rules = await readCashSettings(tx, branchId);
  if (rules.allowWithoutSession || sessionId) return;
  if (
    financedOnly &&
    (await tx.cashSession.findFirst({
      where: {
        closedAt: null,
        cashRegisterId: {
          in: (
            await tx.cashRegister.findMany({
              where: { branchId, active: true },
              select: { id: true },
            })
          ).map((register) => register.id),
        },
      },
    }))
  )
    return;
  throw new BadRequestException(
    "Esta sucursal requiere una caja abierta para vender o registrar cobros. Abrí una caja y reintentá.",
  );
}
