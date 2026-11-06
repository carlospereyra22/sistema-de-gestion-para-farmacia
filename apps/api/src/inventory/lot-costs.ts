type ReceiptMovement = {
  id: string;
  productId: string;
  lotId: string | null;
  quantity: number;
  occurredAt: Date;
  unitCostMinor: bigint | null;
  referenceType: string | null;
  supplierId?: string | null;
  type?: string;
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
  supplierId: string | null;
};

export type LotAdjustment = {
  kind: "ADJUSTMENT" | "RETURN";
  lotId: string;
  quantity: number;
  reason: string;
  adjustedAt: string;
  supplierId: string | null;
  unitCostMinor: string | null;
};

// El motivo de un ajuste no está en el movimiento: queda en su auditoría.
export function lotAdjustments(
  logs: { entityId: string | null; createdAt: Date; after: unknown }[],
): LotAdjustment[] {
  return logs.flatMap((log) => {
    const after = log.after as {
      delta?: unknown;
      reason?: unknown;
      supplierId?: unknown;
      unitCostMinor?: unknown;
    } | null;
    if (!log.entityId || typeof after?.delta !== "number") return [];
    return [
      {
        kind: "ADJUSTMENT" as const,
        lotId: log.entityId,
        quantity: after.delta,
        reason: typeof after.reason === "string" ? after.reason : "",
        adjustedAt: log.createdAt.toISOString(),
        supplierId:
          typeof after.supplierId === "string" ? after.supplierId : null,
        unitCostMinor:
          typeof after.unitCostMinor === "string" ? after.unitCostMinor : null,
      },
    ];
  });
}

// Una devolución saca unidades del lote: va al historial con signo negativo.
export function lotReturns(
  returns: {
    lotId: string;
    supplierId: string | null;
    quantity: number;
    reason: string;
    createdAt: Date;
  }[],
): LotAdjustment[] {
  return returns.map((item) => ({
    kind: "RETURN",
    lotId: item.lotId,
    quantity: -item.quantity,
    reason: item.reason,
    adjustedAt: item.createdAt.toISOString(),
    supplierId: item.supplierId,
    unitCostMinor: null,
  }));
}

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
  // Un ajuste con costo cuenta para el último costo, pero no es una recepción.
  const isAdjustment = (movement: ReceiptMovement) =>
    movement.type === "ADJUSTMENT_IN";
  const adjustedLots = new Set(
    movements.filter(isAdjustment).map((movement) => movement.lotId),
  );
  const lastInventoryReceipt = new Map(
    movements
      .filter(
        (movement) =>
          movement.referenceType !== "PURCHASE" && !isAdjustment(movement),
      )
      .map((movement) => [movement.lotId, movement.id]),
  );
  const receipts = new Map<string, LotCostReceipt[]>();
  const lastCost = new Map<string, { cost: bigint; receivedAt: Date }>();
  for (const movement of movements) {
    const lot = movement.lotId ? lotById.get(movement.lotId) : undefined;
    const cost =
      movement.unitCostMinor ??
      purchaseCosts.get(movement.id) ??
      // El ajuste pisó el costo del lote: ya no sirve para una recepción vieja.
      (lastInventoryReceipt.get(movement.lotId) === movement.id &&
      !adjustedLots.has(movement.lotId)
        ? lot?.unitCostMinor
        : undefined) ??
      null;
    if (cost !== null)
      lastCost.set(movement.productId, {
        cost,
        receivedAt: movement.occurredAt,
      });
    if (!lot || lot.quantity <= 0 || isAdjustment(movement)) continue;
    const list = receipts.get(lot.id) ?? [];
    list.unshift({
      quantity: movement.quantity,
      unitCostMinor: cost?.toString() ?? null,
      receivedAt: movement.occurredAt.toISOString(),
      supplierId: movement.supplierId ?? null,
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
