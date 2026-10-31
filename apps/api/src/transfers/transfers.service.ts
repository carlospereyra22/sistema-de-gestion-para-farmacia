import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId);
    return this.prisma.transfer.findMany({
      where: {
        organizationId,
        OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }],
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async create(
    actorId: string,
    organizationId: string,
    sourceBranchId: string,
    input: {
      destinationBranchId: string;
      items: { lotId: string; quantity: number }[];
    },
  ) {
    await this.assert(actorId, organizationId);
    if (!input.items.length)
      throw new BadRequestException("A transfer requires at least one item.");
    if (sourceBranchId === input.destinationBranchId)
      throw new BadRequestException("Source and destination must differ.");
    if (
      new Set(input.items.map((item) => item.lotId)).size !== input.items.length
    )
      throw new BadRequestException("A lot can only appear once per transfer.");
    return this.prisma.$transaction(async (tx) => {
      const destination = await tx.branch.findFirst({
        where: { id: input.destinationBranchId, organizationId, active: true },
      });
      if (!destination)
        throw new BadRequestException("Destination branch is unavailable.");
      const lots = await tx.productLot.findMany({
        where: {
          id: { in: input.items.map((i) => i.lotId) },
          organizationId,
          branchId: sourceBranchId,
        },
      });
      if (
        lots.length !== input.items.length ||
        lots.some(
          (l) =>
            l.quantity <
            (input.items.find((i) => i.lotId === l.id)?.quantity ?? 0),
        )
      )
        throw new BadRequestException("Insufficient stock for transfer.");
      const transfer = await tx.transfer.create({
        data: {
          organizationId,
          sourceBranchId,
          destinationBranchId: input.destinationBranchId,
          status: "PREPARED",
        },
      });
      await tx.transferItem.createMany({
        data: input.items.map((i) => {
          const lot = lots.find((l) => l.id === i.lotId)!;
          return {
            transferId: transfer.id,
            lotId: lot.id,
            productId: lot.productId,
            quantity: i.quantity,
          };
        }),
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId: sourceBranchId,
        actorId,
        entityType: "TRANSFER",
        entityId: transfer.id,
        action: "PREPARED",
        after: {
          destinationBranchId: input.destinationBranchId,
          items: input.items.map((item) => ({
            lotId: item.lotId,
            quantity: item.quantity,
          })),
        },
      });
      return transfer;
    });
  }
  async dispatch(
    actorId: string,
    organizationId: string,
    sourceBranchId: string,
    id: string,
  ) {
    await this.assert(actorId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: { id, organizationId, sourceBranchId, status: "PREPARED" },
        include: { items: true },
      });
      if (!transfer)
        throw new NotFoundException("Prepared transfer is unavailable.");
      for (const item of transfer.items) {
        await tx.productLot.update({
          where: { id: item.lotId },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            branchId: sourceBranchId,
            productId: item.productId,
            lotId: item.lotId,
            type: "TRANSFER_OUT",
            quantity: -item.quantity,
            actorId,
            referenceType: "TRANSFER",
            referenceId: id,
          },
        });
      }
      const updated = await tx.transfer.update({
        where: { id },
        data: { status: "IN_TRANSIT" },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId: sourceBranchId,
        actorId,
        entityType: "TRANSFER",
        entityId: id,
        action: "DISPATCHED",
        before: { status: "PREPARED" },
        after: { status: "IN_TRANSIT" },
      });
      return updated;
    });
  }
  async receive(
    actorId: string,
    organizationId: string,
    destinationBranchId: string,
    id: string,
  ) {
    await this.assert(actorId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: {
          id,
          organizationId,
          destinationBranchId,
          status: "IN_TRANSIT",
        },
        include: { items: true },
      });
      if (!transfer)
        throw new NotFoundException("Transfer in transit is unavailable.");
      for (const item of transfer.items) {
        const sourceLot = await tx.productLot.findUniqueOrThrow({
          where: { id: item.lotId },
        });
        const lot = await tx.productLot.upsert({
          where: {
            branchId_productId_number: {
              branchId: destinationBranchId,
              productId: item.productId,
              number: sourceLot.number,
            },
          },
          create: {
            organizationId,
            branchId: destinationBranchId,
            productId: item.productId,
            number: sourceLot.number,
            quantity: item.quantity,
            unitCostMinor: sourceLot.unitCostMinor,
            expiresAt: sourceLot.expiresAt,
          },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            branchId: destinationBranchId,
            productId: item.productId,
            lotId: lot.id,
            type: "TRANSFER_IN",
            quantity: item.quantity,
            actorId,
            referenceType: "TRANSFER",
            referenceId: id,
          },
        });
      }
      const updated = await tx.transfer.update({
        where: { id },
        data: { status: "RECEIVED" },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId: destinationBranchId,
        actorId,
        entityType: "TRANSFER",
        entityId: id,
        action: "RECEIVED",
        before: { status: "IN_TRANSIT" },
        after: { status: "RECEIVED" },
      });
      return updated;
    });
  }
  private async assert(actorId: string, organizationId: string) {
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
        role.permissions.some(
          ({ permission }) => permission.code === "INVENTORY_MANAGE",
        ),
      )
    )
      throw new ForbiddenException("You do not have permission.");
  }
}
