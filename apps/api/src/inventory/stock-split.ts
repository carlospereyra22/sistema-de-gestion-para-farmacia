import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { stockAvailability } from "./stock-availability";
import {
  loadLotHistories,
  lotSupplierBreakdown,
  STOCK_SPLIT,
} from "./lot-suppliers";

// Abrir cajas (SISTEMA-103): N cajas de un lote (ej. Buscapina x100) pasan a
// N × factor unidades del producto vinculado (Buscapina blíster x10), con el
// mismo número de lote y vencimiento y el costo dividido.

export type SplitInput = {
  requestId: string;
  lotId: string;
  boxes: number;
  /**
   * Otra presentación que la del vínculo (ej. x100 en x20 en vez de x10).
   * Sin estos campos se usa el vínculo del producto.
   */
  targetProductId?: string;
  factor?: number;
};

export function splitPayload(input: SplitInput) {
  if (
    !Number.isSafeInteger(input.boxes) ||
    input.boxes < 1 ||
    input.boxes > 1_000_000
  )
    throw new BadRequestException("Revisá cuántas cajas querés abrir.");
  if (
    input.factor !== undefined &&
    (!Number.isInteger(input.factor) || input.factor < 2 || input.factor > 1000)
  )
    throw new BadRequestException(
      "Las unidades por caja tienen que ser un entero entre 2 y 1000.",
    );
  return createHash("sha256")
    .update(
      JSON.stringify({
        lotId: input.lotId,
        boxes: input.boxes,
        targetProductId: input.targetProductId ?? null,
        factor: input.factor ?? null,
      }),
    )
    .digest("hex");
}

/** Costo de una unidad a partir del costo de la caja, redondeado a centavos. */
export function fractionCostMinor(boxCostMinor: bigint, factor: number) {
  const d = BigInt(factor);
  return (boxCostMinor + d / 2n) / d;
}

/**
 * Proveedores de las cajas que se abren: lo que sale es lo más viejo del lote,
 * igual que en una transferencia. Devuelve unidades del producto chico.
 */
export function splitSupplierUnits(
  before: Map<string | null, number>,
  after: Map<string | null, number>,
  factor: number,
) {
  const units: { supplierId: string | null; quantity: number }[] = [];
  for (const [supplierId, quantity] of before) {
    const moved = quantity - (after.get(supplierId) ?? 0);
    if (moved > 0) units.push({ supplierId, quantity: moved * factor });
  }
  return units;
}

export type SplitScope = {
  actorId: string;
  organizationId: string;
  branchId: string;
};

/**
 * La apertura dentro de una transacción ya abierta (Inventario o recepción de
 * Compras). La idempotencia del pedido la resuelve quien llama.
 */
export async function abrirCajasEnTx(
  tx: Prisma.TransactionClient,
  { actorId, organizationId, branchId }: SplitScope,
  input: SplitInput & {
    payloadHash: string;
    purchaseReceiptId?: string;
    occurredAt?: Date;
  },
) {
  await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id = ${input.lotId}::uuid AND "organizationId" = ${organizationId}::uuid AND "branchId" = ${branchId}::uuid FOR UPDATE`;
  const lot = await tx.productLot.findFirst({
    where: { id: input.lotId, organizationId, branchId },
  });
  if (!lot) throw new NotFoundException("El lote no está disponible.");
  const product = await tx.product.findFirstOrThrow({
    where: { id: lot.productId, organizationId },
    select: { name: true, splitTargetProductId: true, splitFactor: true },
  });
  // Destino: el elegido al abrir o, si no, el del vínculo del producto.
  const targetId = input.targetProductId ?? product.splitTargetProductId;
  const factor =
    input.factor ??
    (targetId === product.splitTargetProductId ? product.splitFactor : null);
  if (!targetId || !factor)
    throw new BadRequestException(
      `Elegí en qué producto se abre ${product.name} y cuántas unidades trae cada caja.`,
    );
  if (targetId === lot.productId)
    throw new BadRequestException(
      "Una caja no se puede abrir en el mismo producto.",
    );
  const target = await tx.product.findFirst({
    where: { id: targetId, organizationId, active: true },
    select: { id: true, name: true, splitTargetProductId: true },
  });
  if (!target)
    throw new ConflictException(
      "El producto en el que se abre la caja no está disponible.",
    );
  if (target.splitTargetProductId === lot.productId)
    throw new BadRequestException(
      `${target.name} se abre en ${product.name}: elegí una presentación más chica.`,
    );
  const sellable = stockAvailability(lot).sellableQuantity;
  if (sellable < input.boxes)
    throw new ConflictException(
      sellable
        ? `El lote ${lot.number} tiene ${sellable === 1 ? "1 caja" : `${sellable} cajas`} para abrir. Actualizá y revisá la cantidad.`
        : `El lote ${lot.number} no tiene cajas para abrir (sin stock o vencido).`,
    );

  const existing = await tx.productLot.findUnique({
    where: {
      branchId_productId_number: {
        branchId,
        productId: target.id,
        number: lot.number,
      },
    },
  });
  if (existing) {
    await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id = ${existing.id}::uuid FOR UPDATE`;
    if (
      (existing.expiresAt?.toISOString().slice(0, 10) ?? null) !==
      (lot.expiresAt?.toISOString().slice(0, 10) ?? null)
    )
      throw new ConflictException(
        `El lote ${lot.number} de ${target.name} ya tiene otro vencimiento. Revisalo antes de abrir cajas.`,
      );
  }

  const history = (await loadLotHistories(tx, [lot.id])).get(lot.id)!;
  const suppliers = splitSupplierUnits(
    lotSupplierBreakdown(lot.quantity, history),
    lotSupplierBreakdown(lot.quantity - input.boxes, history),
    factor,
  );

  const updated = await tx.productLot.updateMany({
    where: { id: lot.id, quantity: { gte: input.boxes } },
    data: { quantity: { decrement: input.boxes } },
  });
  if (updated.count !== 1)
    throw new ConflictException("El stock cambió. Revisá las cantidades.");

  const units = input.boxes * factor;
  const unitCostMinor = fractionCostMinor(lot.unitCostMinor, factor);
  const targetLot = existing
    ? await tx.productLot.update({
        where: { id: existing.id },
        data: { quantity: { increment: units } },
      })
    : await tx.productLot.create({
        data: {
          organizationId,
          branchId,
          productId: target.id,
          number: lot.number,
          expiresAt: lot.expiresAt,
          quantity: units,
          unitCostMinor,
        },
      });

  const split = await tx.stockSplit.create({
    data: {
      organizationId,
      branchId,
      requestId: input.requestId,
      payloadHash: input.payloadHash,
      sourceProductId: lot.productId,
      targetProductId: target.id,
      sourceLotId: lot.id,
      targetLotId: targetLot.id,
      boxes: input.boxes,
      factor,
      actorId,
      purchaseReceiptId: input.purchaseReceiptId,
    },
  });
  const occurredAt = input.occurredAt ? { occurredAt: input.occurredAt } : {};
  await tx.inventoryMovement.create({
    data: {
      organizationId,
      branchId,
      productId: lot.productId,
      lotId: lot.id,
      type: "ADJUSTMENT_OUT",
      quantity: -input.boxes,
      actorId,
      referenceType: STOCK_SPLIT,
      referenceId: split.id,
      ...occurredAt,
    },
  });
  for (const { supplierId, quantity } of suppliers)
    await tx.inventoryMovement.create({
      data: {
        organizationId,
        branchId,
        productId: target.id,
        lotId: targetLot.id,
        type: "ADJUSTMENT_IN",
        quantity,
        unitCostMinor,
        supplierId,
        actorId,
        referenceType: STOCK_SPLIT,
        referenceId: split.id,
        ...occurredAt,
      },
    });
  await tx.auditLog.create({
    data: {
      actorId,
      organizationId,
      branchId,
      entityType: "PRODUCT_LOT",
      entityId: lot.id,
      action: "STOCK_SPLIT",
      before: {
        lotQuantity: lot.quantity,
        targetQuantity: existing?.quantity ?? 0,
      },
      after: {
        splitId: split.id,
        lotNumber: lot.number,
        sourceProductId: lot.productId,
        sourceProductName: product.name,
        targetProductId: target.id,
        targetProductName: target.name,
        targetLotId: targetLot.id,
        boxes: input.boxes,
        factor,
        units,
        unitCostMinor: unitCostMinor.toString(),
        purchaseReceiptId: input.purchaseReceiptId ?? null,
      },
    },
  });
  return {
    id: split.id,
    sourceLotId: lot.id,
    targetLotId: targetLot.id,
    targetProductId: target.id,
    boxes: input.boxes,
    units,
  };
}
