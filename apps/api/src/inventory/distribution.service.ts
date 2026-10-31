import { reopenForHistoricStock } from "../catalog/branch-product-lifecycle";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { stockAvailability } from "./stock-availability";

export type DistributionInput = {
  requestId: string;
  destination: string;
  reason: string;
  confirmed: boolean;
  items: { lotId: string; quantity: number }[];
};

export function distributionPayload(input: DistributionInput) {
  const destination = input.destination.trim();
  const reason = input.reason.trim();
  if (
    !input.confirmed ||
    destination.length < 3 ||
    destination.length > 150 ||
    reason.length < 3 ||
    reason.length > 300 ||
    !input.items.length ||
    input.items.length > 200 ||
    new Set(input.items.map((i) => i.lotId)).size !== input.items.length ||
    input.items.some(
      (i) =>
        !Number.isSafeInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 2147483647,
    )
  )
    throw new BadRequestException(
      "Revisá destino, motivo, cantidades y confirmación de la salida.",
    );
  const items = [...input.items].sort((a, b) => a.lotId.localeCompare(b.lotId));
  return {
    destination,
    reason,
    items,
    payloadHash: createHash("sha256")
      .update(JSON.stringify({ destination, reason, items }))
      .digest("hex"),
  };
}

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private async access(
    actorId: string,
    organizationId: string,
    branchId: string,
    code: string,
  ) {
    const member = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !member?.active ||
      !member.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException("No tenés permiso para esta operación.");
    if (
      !(await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId, active: true },
      }))
    )
      throw new NotFoundException("Sucursal no disponible.");
  }
  async list(actorId: string, organizationId: string, branchId: string) {
    await this.access(actorId, organizationId, branchId, "INVENTORY_READ");
    return this.prisma.distributionDispatch.findMany({
      where: { organizationId, branchId },
      include: { items: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }
  async create(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: DistributionInput,
  ) {
    await this.access(actorId, organizationId, branchId, "INVENTORY_MANAGE");
    const { destination, reason, items, payloadHash } =
      distributionPayload(input);
    return this.prisma.$transaction(
      async (tx) => {
        // Serializes retries before looking up the persisted request, including lost responses.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${branchId}:${input.requestId}`}, 0))`;
        const previous = await tx.distributionDispatch.findUnique({
          where: {
            organizationId_branchId_requestId: {
              organizationId,
              branchId,
              requestId: input.requestId,
            },
          },
          include: { items: true },
        });
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            throw new ConflictException(
              "Esta solicitud ya se usó con otros datos. Consultá el historial.",
            );
          return previous;
        }
        const snapshots = [];
        for (const item of items) {
          await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${item.lotId}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
          const lot = await tx.productLot.findFirst({
            where: { id: item.lotId, organizationId, branchId },
          });
          if (!lot || stockAvailability(lot).sellableQuantity < item.quantity)
            throw new ConflictException(
              "Stock insuficiente o lote vencido. Actualizá y revisá la salida; no se descontó ningún artículo.",
            );
          const product = await tx.product.findFirst({
            where: { id: lot.productId, organizationId, active: true },
          });
          if (!product) throw new ConflictException("Producto no disponible.");
          const updated = await tx.productLot.updateMany({
            where: {
              id: lot.id,
              organizationId,
              branchId,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              "El stock cambió. Revisá las cantidades.",
            );
          snapshots.push({
            lotId: lot.id,
            productId: lot.productId,
            productName: product.name,
            lotNumber: lot.number,
            expiresAt: lot.expiresAt,
            quantity: item.quantity,
          });
        }
        const dispatch = await tx.distributionDispatch.create({
          data: {
            organizationId,
            branchId,
            requestId: input.requestId,
            payloadHash,
            destination,
            reason,
            actorId,
            items: { create: snapshots },
          },
          include: { items: true },
        });
        await tx.inventoryMovement.createMany({
          data: snapshots.map((item) => ({
            organizationId,
            branchId,
            productId: item.productId,
            lotId: item.lotId,
            type: "ADJUSTMENT_OUT" as const,
            quantity: -item.quantity,
            actorId,
            referenceType: "DISTRIBUTION",
            referenceId: dispatch.id,
          })),
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "DISTRIBUTION",
          entityId: dispatch.id,
          action: "DISPATCHED",
          after: { destination, reason, items },
        });
        return dispatch;
      },
      { timeout: 20000 },
    );
  }
  async reverse(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    reason: string,
    confirmed: boolean,
  ) {
    await this.access(actorId, organizationId, branchId, "INVENTORY_MANAGE");
    if (!confirmed || reason.trim().length < 3 || reason.length > 300)
      throw new BadRequestException(
        "Confirmá que fue un error de registro y que la mercadería no salió.",
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DistributionDispatch" WHERE id=${id}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
      const doc = await tx.distributionDispatch.findFirst({
        where: { id, organizationId, branchId },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException("Salida no encontrada.");
      if (doc.reversedAt) return doc;
      for (const item of [...doc.items].sort((a, b) =>
        a.lotId.localeCompare(b.lotId),
      )) {
        await reopenForHistoricStock(
          tx,
          actorId,
          organizationId,
          branchId,
          item.productId,
          id,
        );
        const result = await tx.productLot.updateMany({
          where: {
            id: item.lotId,
            organizationId,
            branchId,
            productId: item.productId,
          },
          data: { quantity: { increment: item.quantity } },
        });
        if (result.count !== 1)
          throw new ConflictException("El lote original no está disponible.");
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            branchId,
            productId: item.productId,
            lotId: item.lotId,
            type: "ADJUSTMENT_IN",
            quantity: item.quantity,
            actorId,
            referenceType: "DISTRIBUTION_REVERSAL",
            referenceId: id,
          },
        });
      }
      const updated = await tx.distributionDispatch.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: reason.trim() },
        include: { items: true },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "DISTRIBUTION",
        entityId: id,
        action: "REVERSED",
        after: { reason: reason.trim() },
      });
      return updated;
    });
  }
}
