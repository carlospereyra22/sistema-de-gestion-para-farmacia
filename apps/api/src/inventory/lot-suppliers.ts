import type { Prisma } from "@prisma/client";

// Carga o devolución de un lote. supplierId null: sin proveedor.
export type LotEntry = { supplierId: string | null; quantity: number };
export type LotHistory = { receipts: LotEntry[]; returns: LotEntry[] };

function take(entries: LotEntry[], quantity: number) {
  let pending = quantity;
  for (const entry of entries) {
    const used = Math.min(entry.quantity, pending);
    entry.quantity -= used;
    pending -= used;
  }
  return pending;
}

// De quién son las unidades que le quedan al lote. Ventas, ajustes y demás
// salidas no dicen de qué proveedor salen: se gasta primero lo más viejo. Las
// devoluciones sí lo dicen. Lo que sobre sin carga conocida queda sin proveedor,
// así la suma siempre da el stock del lote. `receipts` va de la más vieja a la
// más nueva; un proveedor que ya no tiene unidades queda en 0.
export function lotSupplierBreakdown(lotQuantity: number, history: LotHistory) {
  const left = history.receipts.map((entry) => ({ ...entry }));
  for (const item of history.returns) {
    const pending = take(
      left.filter((entry) => entry.supplierId === item.supplierId),
      item.quantity,
    );
    take(
      left.filter((entry) => entry.supplierId === null),
      pending,
    );
  }
  const remaining = left.reduce((total, entry) => total + entry.quantity, 0);
  take(left, Math.max(0, remaining - lotQuantity));
  const breakdown = new Map<string | null, number>();
  for (const entry of left)
    breakdown.set(
      entry.supplierId,
      (breakdown.get(entry.supplierId) ?? 0) + entry.quantity,
    );
  const unknown = Math.max(0, lotQuantity - remaining);
  if (unknown) breakdown.set(null, (breakdown.get(null) ?? 0) + unknown);
  return breakdown;
}

// Lo de un proveedor dado de baja no se le puede devolver: pasa a sin proveedor.
export function lotReturnableStock(
  breakdown: Map<string | null, number>,
  activeSupplierIds: Set<string>,
) {
  const suppliers = new Map<string, number>();
  let unassigned = 0;
  for (const [supplierId, quantity] of breakdown) {
    if (supplierId && activeSupplierIds.has(supplierId))
      suppliers.set(supplierId, quantity);
    else unassigned += quantity;
  }
  return { suppliers, unassigned };
}

export async function loadLotHistories(
  db: Pick<Prisma.TransactionClient, "inventoryMovement" | "supplierReturn">,
  lotIds: string[],
) {
  const histories = new Map<string, LotHistory>(
    lotIds.map((id) => [id, { receipts: [], returns: [] }]),
  );
  if (!lotIds.length) return histories;
  const [receipts, returns] = await Promise.all([
    db.inventoryMovement.findMany({
      where: {
        lotId: { in: lotIds },
        type: { in: ["PURCHASE_RECEIPT", "TRANSFER_IN"] },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { lotId: true, supplierId: true, quantity: true },
    }),
    db.supplierReturn.findMany({
      where: { lotId: { in: lotIds } },
      select: { lotId: true, supplierId: true, quantity: true },
    }),
  ]);
  for (const { lotId, ...entry } of receipts)
    if (lotId) histories.get(lotId)?.receipts.push(entry);
  for (const { lotId, ...entry } of returns)
    histories.get(lotId)?.returns.push(entry);
  return histories;
}
