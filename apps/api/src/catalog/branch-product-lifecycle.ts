import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type BranchProductStatus = "ACTIVE" | "ARCHIVED" | "DELETED";
export type BranchProductChange = {
  status: BranchProductStatus;
  expectedStatus: BranchProductStatus;
  expectedUpdatedAt?: string | null;
  reason: string;
  expectedStock?: number;
  confirmStockWriteOff?: boolean;
};

export async function branchProductAccess(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  branchId: string,
  manage = false,
) {
  const [member, assignment] = await Promise.all([
    tx.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: { roles: { include: { role: true } } },
    }),
    tx.userBranch.findFirst({
      where: {
        userId: actorId,
        branchId,
        branch: { organizationId, active: true },
      },
    }),
  ]);
  if (
    !member?.active ||
    !assignment ||
    (manage && !member.roles.some(({ role }) => role.code === "ADMIN"))
  )
    throw new ForbiddenException(
      "Necesitás ser administrador y tener acceso a esta sucursal para cambiar el estado del producto.",
    );
}

export async function changeBranchProduct(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  branchId: string,
  productId: string,
  input: BranchProductChange,
) {
  await branchProductAccess(tx, actorId, organizationId, branchId, true);
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300)
    throw new BadRequestException("Indicá un motivo de 3 a 300 caracteres.");
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
  const product = await tx.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product) throw new NotFoundException("Producto no encontrado.");
  const key = { branchId_productId: { branchId, productId } };
  const before = await tx.productBranchState.findUnique({ where: key });
  const status = before?.status ?? (product.active ? "ACTIVE" : "ARCHIVED");
  if (status === input.status) return { id: productId, status }; // Safe retry, never repeat the write-off.
  if (
    status !== input.expectedStatus ||
    (before?.updatedAt.toISOString() ?? null) !==
      (input.expectedUpdatedAt ?? null)
  )
    throw new ConflictException(
      "El estado cambió. Actualizá el catálogo y revisá la operación.",
    );
  if (status === "DELETED")
    throw new ConflictException(
      "El producto ya fue eliminado de esta sucursal.",
    );
  if (input.status === "DELETED" && status !== "ARCHIVED")
    throw new ConflictException(
      "Primero archivá el producto en esta sucursal.",
    );
  if (input.status === "ACTIVE" && !product.active)
    throw new ConflictException(
      "El producto está desactivado en el catálogo general. No se puede activar sólo en esta sucursal.",
    );
  let quantity = 0;
  if (input.status === "DELETED") {
    const pending = await tx.transferItem.count({
      where: {
        productId,
        transfer: {
          organizationId,
          status: { in: ["DRAFT", "PREPARED", "IN_TRANSIT"] },
          OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }],
        },
      },
    });
    const purchases = await tx.purchaseItem.count({
      where: {
        productId,
        purchase: {
          organizationId,
          branchId,
          status: { in: ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"] },
        },
      },
    });
    if (pending || purchases)
      throw new ConflictException(
        "Hay compras o transferencias pendientes de este producto. Resolvelas antes de eliminarlo de la sucursal.",
      );
    const lots = await tx.productLot.findMany({
      where: { organizationId, branchId, productId, quantity: { gt: 0 } },
      orderBy: { id: "asc" },
    });
    quantity = lots.reduce((total, lot) => total + lot.quantity, 0);
    if (
      input.expectedStock !== quantity ||
      (quantity > 0 && !input.confirmStockWriteOff)
    )
      throw new ConflictException(
        "Revisá el stock actual y confirmá expresamente su baja antes de eliminar el producto.",
      );
    for (const lot of lots) {
      await tx.productLot.update({
        where: { id: lot.id },
        data: { quantity: 0 },
      });
      await tx.inventoryMovement.create({
        data: {
          organizationId,
          branchId,
          productId,
          lotId: lot.id,
          type: "ADJUSTMENT_OUT",
          quantity: -lot.quantity,
          actorId,
          referenceType: "BRANCH_PRODUCT_REMOVAL",
          referenceId: productId,
        },
      });
    }
  }
  await tx.productBranchState.upsert({
    where: key,
    create: { organizationId, branchId, productId, status: input.status },
    update: {
      status: input.status,
      updatedAt: new Date(
        Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1),
      ),
    },
  });
  await tx.auditLog.create({
    data: {
      organizationId,
      branchId,
      actorId,
      entityType: "PRODUCT",
      entityId: productId,
      action: `BRANCH_PRODUCT_${input.status}`,
      before: { status },
      after: {
        status: input.status,
        name: product.name,
        reason,
        writtenOffQuantity: quantity,
      },
    },
  });
  return { id: productId, status: input.status };
}

// Historic compensations must remain possible. Restored stock is visible in Archived,
// never silently made sellable and never discarded to keep a deleted row hidden.
export async function reopenForHistoricStock(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  branchId: string,
  productId: string,
  referenceId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
  const before = await tx.productBranchState.findUnique({
    where: { branchId_productId: { branchId, productId } },
  });
  const result = await tx.productBranchState.updateMany({
    where: { organizationId, branchId, productId, status: "DELETED" },
    data: {
      status: "ARCHIVED",
      updatedAt: new Date(
        Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1),
      ),
    },
  });
  if (result.count)
    await tx.auditLog.create({
      data: {
        organizationId,
        branchId,
        actorId,
        entityType: "PRODUCT",
        entityId: productId,
        action: "BRANCH_PRODUCT_HISTORIC_STOCK_RESTORED",
        before: { status: "DELETED" },
        after: {
          status: "ARCHIVED",
          referenceId,
          reason: "Reposición por anulación de una operación histórica",
        },
      },
    });
}
