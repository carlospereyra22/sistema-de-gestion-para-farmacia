type ReceiptMovement = {
  id: string;
  productId: string;
  lotId: string | null;
  quantity: number;
  occurredAt: Date;
  unitCostMinor: bigint | null;
  referenceType: string | null;
};

type CostLot = {
  id: string;
  productId: string;
  quantity: number;
  unitCostMinor: bigint;
  createdAt: Date;
};

export type LotCostReceipt = {
  quantity: number;
  // null: recepción vieja de Inventario, cuyo costo se pisó y ya no se conoce.
  unitCostMinor: string | null;
  receivedAt: string;
};

// Costo de cada recepción y último costo de cada producto. `movements` son las
// recepciones de la sucursal, de la más vieja a la más nueva.
// Las recepciones anteriores a la columna unitCostMinor se resuelven así:
// - Compras guarda el costo en PurchaseReceiptItem (`purchaseCosts`).
// - Inventario pisaba el costo del lote y Compras no lo toca, así que el costo
//   del lote es el de su última recepción por Inventario, aunque después haya
//   compras. Las recepciones por Inventario anteriores quedan sin dato.
export function inventoryCosts(
  movements: ReceiptMovement[],
  purchaseCosts: ReadonlyMap<string, bigint>,
  lots: CostLot[],
) {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const lastInventoryReceipt = new Map(
    movements
      .filter((movement) => movement.referenceType !== "PURCHASE")
      .map((movement) => [movement.lotId, movement.id]),
  );
  const receipts = new Map<string, LotCostReceipt[]>();
  const lastCost = new Map<string, { cost: bigint; receivedAt: Date }>();
  for (const movement of movements) {
    const lot = movement.lotId ? lotById.get(movement.lotId) : undefined;
    const cost =
      movement.unitCostMinor ??
      purchaseCosts.get(movement.id) ??
      (lastInventoryReceipt.get(movement.lotId) === movement.id
        ? lot?.unitCostMinor
        : undefined) ??
      null;
    if (cost !== null)
      lastCost.set(movement.productId, {
        cost,
        receivedAt: movement.occurredAt,
      });
    if (!lot || lot.quantity <= 0) continue;
    const list = receipts.get(lot.id) ?? [];
    list.unshift({
      quantity: movement.quantity,
      unitCostMinor: cost?.toString() ?? null,
      receivedAt: movement.occurredAt.toISOString(),
    });
    receipts.set(lot.id, list);
  }
  // Sin recepciones (por ejemplo, stock que llegó por transferencia) el dato
  // disponible es el costo del lote más nuevo.
  const newestFirst = [...lots].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  for (const lot of newestFirst)
    if (!lastCost.has(lot.productId))
      lastCost.set(lot.productId, {
        cost: lot.unitCostMinor,
        receivedAt: lot.createdAt,
      });
  return {
    products: [...lastCost].map(([productId, { cost, receivedAt }]) => ({
      productId,
      unitCostMinor: cost.toString(),
      receivedAt: receivedAt.toISOString(),
    })),
    lots: [...receipts].map(([lotId, list]) => ({ lotId, receipts: list })),
  };
}
