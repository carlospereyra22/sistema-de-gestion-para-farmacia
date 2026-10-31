import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { stockAvailability } from "./stock-availability";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async editLot(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    input: {
      number: string;
      expiresAt: string | null;
      expectedVersion: number;
      reason: string;
      unitCostMinor?: string;
    },
  ) {
    await this.assert(actorId, organizationId, "INVENTORY_MANAGE");
    await this.branch(organizationId, branchId);
    if (
      input.unitCostMinor !== undefined &&
      (typeof input.unitCostMinor !== "string" ||
        !/^\d{1,14}$/.test(input.unitCostMinor))
    )
      throw new BadRequestException(
        "Indicá un costo válido, no negativo y expresado en centavos.",
      );
    const unitCostMinor =
      input.unitCostMinor === undefined
        ? undefined
        : BigInt(input.unitCostMinor);
    const number = input.number.trim();
    if (
      !number ||
      number.length > 100 ||
      input.reason.trim().length < 3 ||
      input.reason.length > 300
    )
      throw new BadRequestException("Indicá un lote y un motivo válidos.");
    const expiresAt =
      input.expiresAt === null
        ? null
        : new Date(`${input.expiresAt}T00:00:00.000Z`);
    if (
      expiresAt &&
      (Number.isNaN(expiresAt.valueOf()) ||
        expiresAt.toISOString().slice(0, 10) !== input.expiresAt)
    )
      throw new BadRequestException("La fecha de vencimiento no es válida.");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${id}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
        const before = await tx.productLot.findFirst({
          where: { id, organizationId, branchId },
        });
        if (!before)
          throw new NotFoundException("Lote no disponible en esta sucursal.");
        if (before.metadataVersion !== input.expectedVersion)
          throw new ConflictException(
            "El lote cambió en otro equipo. Actualizá el inventario antes de guardar.",
          );
        if (
          await tx.transferItem.findFirst({
            where: {
              lotId: id,
              transfer: {
                organizationId,
                status: { in: ["PREPARED", "IN_TRANSIT"] },
              },
            },
          })
        )
          throw new ConflictException(
            "Completá o cancelá la transferencia pendiente de este lote antes de corregirlo.",
          );
        const after = await tx.productLot.update({
          where: { id },
          data: {
            number,
            expiresAt,
            unitCostMinor,
            metadataVersion: { increment: 1 },
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "PRODUCT_LOT",
          entityId: id,
          action: "METADATA_UPDATED",
          before: {
            number: before.number,
            unitCostMinor: before.unitCostMinor.toString(),
            expiresAt: before.expiresAt?.toISOString() ?? null,
            metadataVersion: before.metadataVersion,
          },
          after: {
            number,
            unitCostMinor: after.unitCostMinor.toString(),
            expiresAt: expiresAt?.toISOString() ?? null,
            metadataVersion: after.metadataVersion,
            reason: input.reason.trim(),
          },
        });
        return {
          id,
          number,
          unitCostMinor: after.unitCostMinor.toString(),
          expiresAt,
          metadataVersion: after.metadataVersion,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe ese número de lote para este producto en la sucursal. No se fusionaron existencias.",
        );
      throw error;
    }
  }

  async stock(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "INVENTORY_READ");
    await this.branch(organizationId, branchId);
    const lots = await this.prisma.productLot.findMany({
      where: { organizationId, branchId, quantity: { gt: 0 } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: lots.map((lot) => lot.productId) } },
      select: { id: true, name: true },
    });
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    return lots.map((lot) => ({
      ...lot,
      ...stockAvailability(lot),
      productName: names.get(lot.productId) ?? "Producto eliminado",
      unitCostMinor: lot.unitCostMinor.toString(),
    }));
  }

  async expiring(actorId: string, organizationId: string, branchId: string) {
    const lots = await this.stock(actorId, organizationId, branchId);
    const limit = new Date();
    limit.setDate(limit.getDate() + 90);
    return lots.filter((lot) => lot.expiresAt && lot.expiresAt <= limit);
  }

  async history(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "INVENTORY_READ");
    await this.branch(organizationId, branchId);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        branchId,
        type: {
          in: [
            "PURCHASE_RECEIPT",
            "ADJUSTMENT_IN",
            "ADJUSTMENT_OUT",
            "SUPPLIER_RETURN",
          ],
        },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    });
    const [products, lots] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId,
          id: { in: movements.map((item) => item.productId) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.productLot.findMany({
        where: {
          organizationId,
          branchId,
          id: {
            in: movements.flatMap((item) => (item.lotId ? [item.lotId] : [])),
          },
        },
        select: { id: true, number: true },
      }),
    ]);
    const names = new Map(products.map((item) => [item.id, item.name]));
    const numbers = new Map(lots.map((item) => [item.id, item.number]));
    return movements.map((item) => ({
      ...item,
      productName: names.get(item.productId) ?? "Producto no disponible",
      lotNumber: item.lotId ? (numbers.get(item.lotId) ?? null) : null,
    }));
  }

  async receive(
    actorId: string,
    input: {
      organizationId: string;
      branchId: string;
      productId: string;
      lotNumber: string;
      quantity: number;
      unitCostMinor: number;
      expiresAt?: Date;
    },
  ) {
    await this.assert(actorId, input.organizationId, "INVENTORY_MANAGE");
    await this.branch(input.organizationId, input.branchId);
    const product = await this.prisma.product.findFirst({
      where: {
        id: input.productId,
        organizationId: input.organizationId,
        active: true,
      },
    });
    if (!product)
      throw new NotFoundException(
        "Product is unavailable in this organization.",
      );
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.productLot.findUnique({
        where: {
          branchId_productId_number: {
            branchId: input.branchId,
            productId: input.productId,
            number: input.lotNumber.trim(),
          },
        },
      });
      const lot = existing
        ? await tx.productLot.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: input.quantity },
              unitCostMinor: BigInt(input.unitCostMinor),
              expiresAt: input.expiresAt,
              metadataVersion: { increment: 1 },
            },
          })
        : await tx.productLot.create({
            data: {
              organizationId: input.organizationId,
              branchId: input.branchId,
              productId: input.productId,
              number: input.lotNumber.trim(),
              quantity: input.quantity,
              unitCostMinor: BigInt(input.unitCostMinor),
              expiresAt: input.expiresAt,
            },
          });
      await tx.inventoryMovement.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          productId: input.productId,
          lotId: lot.id,
          type: "PURCHASE_RECEIPT",
          quantity: input.quantity,
          actorId,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        actorId,
        entityType: "PRODUCT_LOT",
        entityId: lot.id,
        action: "STOCK_RECEIVED",
        after: {
          productId: input.productId,
          lotNumber: input.lotNumber.trim(),
          quantity: input.quantity,
        },
      });
      return { ...lot, unitCostMinor: lot.unitCostMinor.toString() };
    });
  }

  async adjust(
    actorId: string,
    input: {
      organizationId: string;
      branchId: string;
      lotId: string;
      quantity: number;
      reason: string;
    },
  ) {
    await this.assert(actorId, input.organizationId, "INVENTORY_MANAGE");
    if (!input.quantity)
      throw new ForbiddenException(
        "La variación de cantidad no puede ser 0: no modificaría el stock. Ingresá un número positivo para sumar unidades o negativo para restarlas. Para dejar el lote en cero, restá su cantidad actual.",
      );
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.productLot.findFirst({
        where: {
          id: input.lotId,
          organizationId: input.organizationId,
          branchId: input.branchId,
        },
      });
      if (!lot) throw new NotFoundException("Lot is unavailable.");
      if (lot.quantity + input.quantity < 0)
        throw new ForbiddenException(
          "The adjustment would create negative stock.",
        );
      const updated = await tx.productLot.update({
        where: { id: lot.id },
        data: { quantity: { increment: input.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          productId: lot.productId,
          lotId: lot.id,
          type: input.quantity > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: input.quantity,
          actorId,
          referenceType: "ADJUSTMENT",
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        actorId,
        entityType: "PRODUCT_LOT",
        entityId: lot.id,
        action: "STOCK_ADJUSTED",
        before: { quantity: lot.quantity },
        after: {
          quantity: updated.quantity,
          delta: input.quantity,
          reason: input.reason.trim(),
        },
      });
      return { id: updated.id, quantity: updated.quantity };
    });
  }

  async supplierReturn(
    actorId: string,
    input: {
      organizationId: string;
      branchId: string;
      supplierId: string;
      lotId: string;
      quantity: number;
      reason: string;
    },
  ) {
    await this.assert(actorId, input.organizationId, "INVENTORY_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      const [supplier, lot] = await Promise.all([
        tx.supplier.findFirst({
          where: {
            id: input.supplierId,
            organizationId: input.organizationId,
            active: true,
          },
        }),
        tx.productLot.findFirst({
          where: {
            id: input.lotId,
            organizationId: input.organizationId,
            branchId: input.branchId,
          },
        }),
      ]);
      if (!supplier) throw new NotFoundException("Supplier is unavailable.");
      if (!lot || lot.quantity < input.quantity)
        throw new ForbiddenException("Insufficient stock for supplier return.");
      const supplierReturn = await tx.supplierReturn.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          lotId: lot.id,
          productId: lot.productId,
          quantity: input.quantity,
          reason: input.reason.trim(),
          actorId,
        },
      });
      await tx.productLot.update({
        where: { id: lot.id },
        data: { quantity: { decrement: input.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          productId: lot.productId,
          lotId: lot.id,
          type: "SUPPLIER_RETURN",
          quantity: -input.quantity,
          actorId,
          referenceType: "SUPPLIER_RETURN",
          referenceId: supplierReturn.id,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        actorId,
        entityType: "SUPPLIER_RETURN",
        entityId: supplierReturn.id,
        action: "DISPATCHED",
        after: {
          supplierId: input.supplierId,
          lotId: lot.id,
          quantity: input.quantity,
          reason: input.reason.trim(),
        },
      });
      return supplierReturn;
    });
  }

  private async branch(organizationId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId, active: true },
    });
    if (!branch) throw new NotFoundException("Branch is unavailable.");
  }

  private async assert(actorId: string, organizationId: string, code: string) {
    const membership = await this.prisma.userOrganization.findUnique({
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
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException("You do not have the required permission.");
  }
}
