import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SupplierPayablesService } from "../supplier-payables/supplier-payables.service";
import { payableToday } from "../supplier-payables/payable-rules";
import type {
  PurchaseInput,
  ReceiptInput,
  ReceiptLineInput,
  DirectPurchaseInput,
} from "./purchase-input";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const serializable = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payables: SupplierPayablesService = new SupplierPayablesService(
      prisma,
      audit,
    ),
  ) {}
  async list(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_READ");
    const purchases = await this.prisma.purchase.findMany({
      where: { organizationId, branchId },
      include: {
        items: true,
        _count: { select: { payableInvoices: { where: { receiptId: null } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const suppliers = await this.prisma.supplier.findMany({
      where: { organizationId, id: { in: purchases.map((p) => p.supplierId) } },
    });
    return serializable(
      purchases.map((p) => ({
        ...p,
        hasRegisteredDebt: p._count.payableInvoices > 0,
        supplierName:
          suppliers.find((s) => s.id === p.supplierId)?.name ??
          "Proveedor histórico",
      })),
    );
  }
  async detail(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
  ) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_READ");
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId, branchId },
      include: {
        items: true,
        _count: { select: { payableInvoices: { where: { receiptId: null } } } },
        receipts: { include: { items: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!purchase) throw new NotFoundException("Compra no disponible.");
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        branchId,
        referenceType: "PURCHASE",
        referenceId: id,
      },
      orderBy: { occurredAt: "asc" },
    });
    const linked = new Set(
      purchase.receipts.flatMap((r) => r.items.map((i) => i.movementId)),
    );
    const legacy = movements.filter((m) => !linked.has(m.id));
    const lots = await this.prisma.productLot.findMany({
      where: {
        id: { in: legacy.flatMap((m) => (m.lotId ? [m.lotId] : [])) },
        organizationId,
        branchId,
      },
    });
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: purchase.supplierId, organizationId },
    });
    return serializable({
      ...purchase,
      hasRegisteredDebt: purchase._count.payableInvoices > 0,
      supplierName: supplier?.name ?? "Proveedor histórico",
      legacyMovements: legacy.map((m) => ({
        ...m,
        lotNumber:
          lots.find((l) => l.id === m.lotId)?.number ?? "No disponible",
      })),
    });
  }
  async create(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: PurchaseInput,
  ) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        const p = await this.createInTransaction(
          tx,
          actorId,
          organizationId,
          branchId,
          input,
          hash(input),
        );
        return { id: p.id, status: p.status };
      },
      { timeout: 30000 },
    );
  }
  async direct(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: DirectPurchaseInput,
  ) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_MANAGE");
    if (!input.clientOperationId)
      throw new BadRequestException(
        "La compra directa necesita una clave de operación.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        const p = await this.createInTransaction(
          tx,
          actorId,
          organizationId,
          branchId,
          input,
          hash(input),
        );
        const items = await tx.purchaseItem.findMany({
          where: { purchaseId: p.id },
        });
        const receipt = await this.receiveInTransaction(
          tx,
          actorId,
          organizationId,
          branchId,
          p.id,
          {
            operationId: input.clientOperationId,
            debt: input.debt,
            notes: input.notes,
            items: input.receipts.map((line) => ({
              ...line,
              itemId:
                items.find((i) => i.productId === line.productId)?.id ?? "",
            })),
          },
        );
        return { id: p.id, ...receipt };
      },
      { timeout: 30000 },
    );
  }
  private async createInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    branchId: string,
    input: PurchaseInput,
    requestHash: string,
  ) {
    if (input.clientOperationId) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`purchase:${organizationId}:${branchId}:${input.clientOperationId}`}, 0))::text`;
      const previous = await tx.purchase.findUnique({
        where: {
          organizationId_branchId_clientOperationId: {
            organizationId,
            branchId,
            clientOperationId: input.clientOperationId,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException(
            "La solicitud ya se usó con otros datos.",
          );
        return previous;
      }
    }
    if (
      !input.items.length ||
      input.items.length > 100 ||
      new Set(input.items.map((i) => i.productId)).size !== input.items.length
    )
      throw new BadRequestException(
        "Cargá entre 1 y 100 productos sin repetir.",
      );
    for (const line of input.items)
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > 1000000 ||
        !Number.isSafeInteger(line.unitCostMinor) ||
        line.unitCostMinor < 0 ||
        !Number.isSafeInteger(line.quantity * line.unitCostMinor)
      )
        throw new BadRequestException(
          "Revisá cantidades y costos de los artículos.",
        );
    if (
      (input.reference?.length ?? 0) > 120 ||
      (input.notes?.length ?? 0) > 1000 ||
      (input.orderedAt && !Number.isFinite(new Date(input.orderedAt).valueOf()))
    )
      throw new BadRequestException("Datos generales inválidos.");
    if (
      !(await tx.supplier.findFirst({
        where: { id: input.supplierId, organizationId, active: true },
      }))
    )
      throw new NotFoundException("Proveedor no disponible.");
    const count = await tx.product.count({
      where: {
        organizationId,
        active: true,
        id: { in: input.items.map((i) => i.productId) },
        branchStates: { none: { branchId, status: { not: "ACTIVE" } } },
      },
    });
    if (count !== input.items.length)
      throw new NotFoundException(
        "Hay productos no disponibles en esta sucursal.",
      );
    const p = await tx.purchase.create({
      data: {
        organizationId,
        branchId,
        supplierId: input.supplierId,
        status: "ORDERED",
        clientOperationId: input.clientOperationId,
        requestHash,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        orderedAt: input.orderedAt ? new Date(input.orderedAt) : new Date(),
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            orderedQuantity: i.quantity,
            unitCostMinor: BigInt(i.unitCostMinor),
          })),
        },
      },
    });
    await this.audit.recordInTransaction(tx, {
      organizationId,
      branchId,
      actorId,
      entityType: "PURCHASE",
      entityId: p.id,
      action: "ORDERED",
      after: { ...input, requestHash },
    });
    return p;
  }
  // Clientes anteriores conservan el cuerpo individual. El nuevo cliente siempre envía operationId.
  async receive(
    actorId: string,
    organizationId: string,
    branchId: string,
    purchaseId: string,
    input: ReceiptInput | (ReceiptLineInput & { operationId?: string }),
  ) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_MANAGE");
    const batch: ReceiptInput =
      "items" in input
        ? input
        : { operationId: input.operationId ?? randomUUID(), items: [input] };
    return this.prisma.$transaction(
      (tx) =>
        this.receiveInTransaction(
          tx,
          actorId,
          organizationId,
          branchId,
          purchaseId,
          batch,
        ),
      { timeout: 30000 },
    );
  }
  private async receiveInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    branchId: string,
    purchaseId: string,
    input: ReceiptInput,
  ) {
    if (!input.operationId)
      throw new BadRequestException(
        "La recepción necesita una clave de operación.",
      );
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt:${organizationId}:${branchId}:${input.operationId}`}, 0))::text`;
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${purchaseId}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
    const p = await tx.purchase.findFirst({
      where: { id: purchaseId, organizationId, branchId },
      include: { items: true },
    });
    if (!p) throw new NotFoundException("Compra no disponible.");
    const requestHash = hash({ purchaseId, ...input });
    const previous = await tx.purchaseReceipt.findUnique({
      where: {
        organizationId_branchId_operationId: {
          organizationId,
          branchId,
          operationId: input.operationId,
        },
      },
    });
    if (previous) {
      if (
        previous.requestHash !== requestHash ||
        previous.purchaseId !== purchaseId
      )
        throw new ConflictException(
          "Esta recepción ya fue usada con otros datos.",
        );
      return { receiptId: previous.id, status: p.status };
    }
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status))
      throw new BadRequestException("Esta compra ya no tiene saldo abierto.");
    if (
      input.debt &&
      (await tx.supplierPayableInvoice.count({
        where: { purchaseId, organizationId, branchId, receiptId: null },
      }))
    )
      throw new ConflictException(
        "Esta compra ya tiene una deuda registrada. Actualizá la recepción para ingresar mercadería sin duplicarla.",
      );
    if (
      !input.items.length ||
      input.items.length > 500 ||
      (input.notes?.length ?? 0) > 1000
    )
      throw new BadRequestException("Revisá las líneas y observaciones.");
    const totals = new Map<string, number>();
    for (const line of input.items) {
      if (
        !p.items.some((i) => i.id === line.itemId) ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity <= 0 ||
        !line.lotNumber.trim() ||
        line.lotNumber.length > 100 ||
        (line.expiresAt && !Number.isFinite(line.expiresAt.valueOf()))
      )
        throw new BadRequestException(
          "Revisá artículo, cantidad, lote y vencimiento de cada fila.",
        );
      totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
    }
    for (const i of p.items)
      if (
        (totals.get(i.id) ?? 0) >
        i.orderedQuantity - i.receivedQuantity - i.cancelledQuantity
      )
        throw new ConflictException(
          "La cantidad supera el pendiente actual. Actualizá la compra.",
        );
    const member = await tx.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
    });
    const receipt = await tx.purchaseReceipt.create({
      data: {
        purchaseId,
        organizationId,
        branchId,
        operationId: input.operationId,
        requestHash,
        actorId,
        actorName: member?.displayName || "Usuario sin nombre configurado",
        notes: input.notes?.trim() || null,
      },
    });
    const productIds = [
      ...new Set(
        p.items.filter((i) => totals.has(i.id)).map((i) => i.productId),
      ),
    ].sort();
    for (const productId of productIds)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-lot:${branchId}:${productId}`}, 0))::text`;
    for (const line of [...input.items].sort(
      (a, b) =>
        a.itemId.localeCompare(b.itemId) ||
        a.lotNumber.localeCompare(b.lotNumber),
    )) {
      const item = p.items.find((i) => i.id === line.itemId)!;
      const product = await tx.product.findFirst({
        where: {
          id: item.productId,
          organizationId,
          active: true,
          branchStates: { none: { branchId, status: { not: "ACTIVE" } } },
        },
      });
      if (!product)
        throw new BadRequestException(
          "Producto no disponible para recibir en esta sucursal.",
        );
      const number = line.lotNumber.trim();
      const existing = await tx.productLot.findUnique({
        where: {
          branchId_productId_number: {
            branchId,
            productId: item.productId,
            number,
          },
        },
      });
      if (existing) {
        await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${existing.id}::uuid FOR UPDATE`;
        const current = await tx.productLot.findUniqueOrThrow({
          where: { id: existing.id },
        });
        if (
          (current.expiresAt?.toISOString().slice(0, 10) ?? null) !==
          (line.expiresAt?.toISOString().slice(0, 10) ?? null)
        )
          throw new ConflictException(
            `El lote ${number} ya tiene otro vencimiento. Revisalo sin sobrescribirlo.`,
          );
      }
      const lot = await tx.productLot.upsert({
        where: {
          branchId_productId_number: {
            branchId,
            productId: item.productId,
            number,
          },
        },
        create: {
          organizationId,
          branchId,
          productId: item.productId,
          number,
          quantity: line.quantity,
          unitCostMinor: item.unitCostMinor,
          expiresAt: line.expiresAt,
        },
        update: { quantity: { increment: line.quantity } },
      });
      if (
        (lot.expiresAt?.toISOString().slice(0, 10) ?? null) !==
        (line.expiresAt?.toISOString().slice(0, 10) ?? null)
      )
        throw new ConflictException(
          "El lote cambió durante la recepción. Revisá su vencimiento.",
        );
      const movement = await tx.inventoryMovement.create({
        data: {
          organizationId,
          branchId,
          productId: item.productId,
          lotId: lot.id,
          type: "PURCHASE_RECEIPT",
          quantity: line.quantity,
          actorId,
          referenceType: "PURCHASE",
          referenceId: purchaseId,
        },
      });
      await tx.purchaseReceiptItem.create({
        data: {
          receiptId: receipt.id,
          purchaseItemId: item.id,
          productId: item.productId,
          productName: product.name,
          lotId: lot.id,
          lotNumber: number,
          expiresAt: line.expiresAt,
          quantity: line.quantity,
          unitCostMinor: item.unitCostMinor,
          movementId: movement.id,
        },
      });
    }
    for (const [id, quantity] of totals)
      await tx.purchaseItem.update({
        where: { id },
        data: { receivedQuantity: { increment: quantity } },
      });
    const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
    const complete = items.every(
      (i) => i.receivedQuantity + i.cancelledQuantity === i.orderedQuantity,
    );
    const status = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchase.update({
      where: { id: purchaseId },
      data: { status, receivedAt: complete ? new Date() : null },
    });
    await this.audit.recordInTransaction(tx, {
      organizationId,
      branchId,
      actorId,
      entityType: "PURCHASE",
      entityId: purchaseId,
      action: "RECEIPT_RECORDED",
      after: {
        receiptId: receipt.id,
        operationId: input.operationId,
        status,
        items: input.items.map((i) => ({
          ...i,
          expiresAt: i.expiresAt?.toISOString() ?? null,
        })),
      },
    });
    if (input.debt) {
      await this.payables.create(
        actorId,
        organizationId,
        branchId,
        {
          operationId: input.operationId,
          supplierId: p.supplierId,
          purchaseId,
          documentType: "OTRO",
          pointOfSale: "",
          documentNumber: "",
          issuedOn: payableToday(),
          amountMinor: input.debt.amountMinor,
          dues: [
            { dueOn: input.debt.dueOn, amountMinor: input.debt.amountMinor },
          ],
          reference: `Recepción ${receipt.id.slice(0, 8).toUpperCase()}`,
        },
        tx,
        receipt.id,
      );
    }
    return { receiptId: receipt.id, status };
  }
  async closeBalance(
    actorId: string,
    organizationId: string,
    branchId: string,
    purchaseId: string,
    reason: string,
    expected: { itemId: string; pending: number }[],
  ) {
    await this.assert(actorId, organizationId, branchId, "PURCHASE_MANAGE");
    if (reason.trim().length < 3 || reason.length > 300)
      throw new BadRequestException("Indicá un motivo de 3 a 300 caracteres.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${purchaseId}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
      const p = await tx.purchase.findFirst({
        where: { id: purchaseId, organizationId, branchId },
        include: { items: true },
      });
      if (!p) throw new NotFoundException("Compra no disponible.");
      if (p.closedAt) return { id: p.id, status: p.status };
      if (
        !["ORDERED", "PARTIALLY_RECEIVED"].includes(p.status) ||
        expected.length !== p.items.length ||
        p.items.some(
          (i) =>
            expected.find((e) => e.itemId === i.id)?.pending !==
            i.orderedQuantity - i.receivedQuantity - i.cancelledQuantity,
        )
      )
        throw new ConflictException(
          "El pendiente cambió. Actualizá antes de cerrar el saldo.",
        );
      for (const i of p.items)
        await tx.purchaseItem.update({
          where: { id: i.id },
          data: { cancelledQuantity: i.orderedQuantity - i.receivedQuantity },
        });
      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          status: "CANCELLED",
          closedAt: new Date(),
          closedReason: reason.trim(),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "PURCHASE",
        entityId: purchaseId,
        action: "BALANCE_CLOSED",
        after: { reason: reason.trim(), pending: expected },
      });
      return { id: p.id, status: "CANCELLED" };
    });
  }
  private async assert(
    actorId: string,
    organizationId: string,
    branchId: string,
    code: string,
  ) {
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
      throw new ForbiddenException("No tenés permiso para esta operación.");
    if (
      !(await this.prisma.userBranch.findFirst({
        where: {
          userId: actorId,
          branchId,
          branch: { organizationId, active: true },
        },
      }))
    )
      throw new ForbiddenException("No tenés acceso a esta sucursal.");
  }
}
