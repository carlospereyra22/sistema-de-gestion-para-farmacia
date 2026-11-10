import { createHash } from "node:crypto";
import { enTandas } from "../common/db/en-tandas";
import { rangoDeParte } from "../catalog/catalogo-por-partes";
import { rangoDeHistorial } from "../common/db/rango-historial";
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
import {
  loadLotHistories,
  lotReturnableStock,
  lotSupplierBreakdown,
  SUPPLIER_ADJUSTMENT,
} from "./lot-suppliers";
import { stockAvailability } from "./stock-availability";
import { inventoryCosts, lotAdjustments, lotReturns } from "./lot-costs";

function lotSupplierStock(
  stock: ReturnType<typeof lotReturnableStock>,
  names: Map<string, string>,
) {
  return {
    suppliers: [...stock.suppliers].map(([id, quantity]) => ({
      id,
      name: names.get(id)!,
      quantity,
    })),
    unassignedQuantity: stock.unassigned,
  };
}

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
        // Corregir el costo corrige la última recepción del lote, que es lo que
        // muestra Productos. El valor anterior queda en la auditoría y la compra
        // conserva lo que se facturó.
        if (
          unitCostMinor !== undefined &&
          unitCostMinor !== before.unitCostMinor
        ) {
          const receipt = await tx.inventoryMovement.findFirst({
            where: { lotId: id, type: "PURCHASE_RECEIPT" },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            select: { id: true },
          });
          if (receipt)
            await tx.inventoryMovement.update({
              where: { id: receipt.id },
              data: { unitCostMinor },
            });
        }
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
    const seesCosts = await this.puedeVerStock(
      actorId,
      organizationId,
      branchId,
    );
    return this.armarStock(organizationId, branchId, seesCosts);
  }

  /** Permiso de stock y si ve costos: el mostrador consulta stock sin costos. */
  private async puedeVerStock(
    actorId: string,
    organizationId: string,
    branchId: string,
  ) {
    await this.assert(actorId, organizationId, "INVENTORY_READ");
    const seesCosts = (await this.permissionCodes(actorId, organizationId)).has(
      "COST_READ",
    );
    await this.branch(organizationId, branchId);
    return seesCosts;
  }

  /**
   * Stock por partes (SISTEMA-77), como el catálogo: la parte de un lote es la
   * de su producto (dos primeros caracteres del id). La versión resume todo lo
   * que cambia lo que se devuelve de cada lote: el lote, el nombre del
   * producto, sus cargas y devoluciones por proveedor (de ahí sale de quién son
   * las unidades), los proveedores y si se ven los costos.
   */
  async stockVersions(
    actorId: string,
    organizationId: string,
    branchId: string,
  ): Promise<{ partes: Record<string, string> }> {
    const seesCosts = await this.puedeVerStock(
      actorId,
      organizationId,
      branchId,
    );
    return {
      partes: await this.versionesDeStock(organizationId, branchId, seesCosts),
    };
  }

  /** Lotes de algunas partes del stock, con la versión de cada una. */
  async stockParts(
    actorId: string,
    organizationId: string,
    branchId: string,
    partes: string[],
  ) {
    const seesCosts = await this.puedeVerStock(
      actorId,
      organizationId,
      branchId,
    );
    // La versión se lee antes que los lotes: si algo cambia en el medio, la
    // PC queda con una versión vieja y la vuelve a pedir, nunca al revés.
    const todas = await this.versionesDeStock(
      organizationId,
      branchId,
      seesCosts,
    );
    const lotes = await this.armarStock(
      organizationId,
      branchId,
      seesCosts,
      partes,
    );
    return {
      versiones: Object.fromEntries(
        partes.map((parte) => [parte, todas[parte] ?? null]),
      ),
      lotes,
    };
  }

  private async versionesDeStock(
    organizationId: string,
    branchId: string,
    seesCosts: boolean,
  ) {
    const [filas, proveedores] = await Promise.all([
      this.prisma.$queryRaw<{ parte: string; huella: string }[]>`
        WITH lotes AS (
          SELECT * FROM "ProductLot"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "branchId" = ${branchId}::uuid
            AND quantity > 0
        ), cargas AS (
          SELECT m."lotId", count(*) AS c, sum(m.quantity) AS s, max(m."occurredAt") AS u
          FROM "InventoryMovement" m JOIN lotes ON lotes.id = m."lotId"
          WHERE m.type IN ('PURCHASE_RECEIPT', 'TRANSFER_IN')
             OR (m.type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
                 AND m."referenceType" = ${SUPPLIER_ADJUSTMENT})
          GROUP BY m."lotId"
        ), devoluciones AS (
          SELECT r."lotId", count(*) AS c, sum(r.quantity) AS s, max(r."createdAt") AS u
          FROM "SupplierReturn" r JOIN lotes ON lotes.id = r."lotId"
          GROUP BY r."lotId"
        )
        SELECT substr(lotes."productId"::text, 1, 2) AS parte,
          md5(string_agg(concat(
            lotes.id, ':', lotes.quantity, ':', lotes."expiresAt", ':', lotes.number, ':',
            lotes."unitCostMinor", ':', lotes."packFactor", ':', lotes."packCount", ':',
            lotes."metadataVersion", ':', lotes."createdAt", ':', p.name, ':',
            cargas.c, ':', cargas.s, ':', cargas.u, ':',
            devoluciones.c, ':', devoluciones.s, ':', devoluciones.u
          ), ',' ORDER BY lotes.id)) AS huella
        FROM lotes
        LEFT JOIN "Product" p ON p.id = lotes."productId"
        LEFT JOIN cargas ON cargas."lotId" = lotes.id
        LEFT JOIN devoluciones ON devoluciones."lotId" = lotes.id
        GROUP BY 1`,
      this.prisma.$queryRaw<{ huella: string | null }[]>`
        SELECT md5(string_agg(concat(id, ':', name, ':', active), ',' ORDER BY id)) AS huella
        FROM "Supplier" WHERE "organizationId" = ${organizationId}::uuid`,
    ]);
    const contexto = `${seesCosts ? "costos" : "sin-costos"}|${proveedores[0]?.huella ?? "-"}`;
    return Object.fromEntries(
      filas.map(({ parte, huella }) => [
        parte,
        createHash("sha1")
          .update(`${contexto}|${huella}`)
          .digest("hex")
          .slice(0, 20),
      ]),
    );
  }

  private async armarStock(
    organizationId: string,
    branchId: string,
    seesCosts: boolean,
    partes?: string[],
  ) {
    const rangos = partes?.map((parte) => rangoDeParte(parte));
    const lots = await this.prisma.productLot.findMany({
      where: {
        organizationId,
        branchId,
        quantity: { gt: 0 },
        ...(rangos ? { OR: rangos.map((productId) => ({ productId })) } : {}),
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    });
    // Los nombres por organización, no por una lista de ids (SISTEMA-74).
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(rangos ? { OR: rangos.map((id) => ({ id })) } : {}),
      },
      select: { id: true, name: true },
    });
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const histories = await loadLotHistories(
      this.prisma,
      lots.map((lot) => lot.id),
    );
    const breakdowns = new Map(
      lots.map((lot) => [
        lot.id,
        lotSupplierBreakdown(lot.quantity, histories.get(lot.id)!),
      ]),
    );
    const supplierIds = [...breakdowns.values()].flatMap((breakdown) =>
      [...breakdown.keys()].filter((id) => id !== null),
    );
    const suppliers = supplierIds.length
      ? await this.prisma.supplier.findMany({
          where: {
            organizationId,
            id: { in: [...new Set(supplierIds)] },
            active: true,
          },
          select: { id: true, name: true },
        })
      : [];
    const supplierNames = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name]),
    );
    const activeSuppliers = new Set(supplierNames.keys());
    return lots.map(({ unitCostMinor, ...lot }) => ({
      ...lot,
      ...stockAvailability(lot),
      productName: names.get(lot.productId) ?? "Producto eliminado",
      ...(seesCosts ? { unitCostMinor: unitCostMinor.toString() } : {}),
      ...lotSupplierStock(
        lotReturnableStock(breakdowns.get(lot.id)!, activeSuppliers),
        supplierNames,
      ),
    }));
  }

  // Sólo lectura de costos: lo que se pagó en cada recepción y el último costo
  // de cada producto en la sucursal.
  async costs(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "COST_READ");
    await this.branch(organizationId, branchId);
    const [movements, lots] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: {
          organizationId,
          branchId,
          lotId: { not: null },
          OR: [
            { type: "PURCHASE_RECEIPT" },
            { type: "ADJUSTMENT_IN", unitCostMinor: { not: null } },
          ],
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          productId: true,
          lotId: true,
          quantity: true,
          occurredAt: true,
          unitCostMinor: true,
          referenceType: true,
          supplierId: true,
          type: true,
        },
      }),
      this.prisma.productLot.findMany({
        where: { organizationId, branchId },
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitCostMinor: true,
          createdAt: true,
        },
      }),
    ]);
    const stockedLotIds = lots
      .filter((lot) => lot.quantity > 0)
      .map((lot) => lot.id);
    const [purchaseItems, adjustments, returns] = await Promise.all([
      this.prisma.purchaseReceiptItem.findMany({
        where: {
          movementId: {
            in: movements
              .filter((movement) => movement.unitCostMinor === null)
              .map((movement) => movement.id),
          },
        },
        select: { movementId: true, unitCostMinor: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          branchId,
          entityType: "PRODUCT_LOT",
          action: "STOCK_ADJUSTED",
          entityId: { in: stockedLotIds },
        },
        select: { entityId: true, createdAt: true, after: true },
      }),
      this.prisma.supplierReturn.findMany({
        where: { organizationId, branchId, lotId: { in: stockedLotIds } },
        select: {
          lotId: true,
          supplierId: true,
          quantity: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);
    const lotChanges = [...lotAdjustments(adjustments), ...lotReturns(returns)];
    // Incluye los dados de baja: el historial conserva quién entregó cada carga.
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        organizationId,
        id: {
          in: [...movements, ...lotChanges].flatMap((item) =>
            item.supplierId ? [item.supplierId] : [],
          ),
        },
      },
      select: { id: true, name: true },
    });
    return {
      ...inventoryCosts(
        movements,
        new Map(
          purchaseItems.map((item) => [item.movementId, item.unitCostMinor]),
        ),
        lots,
      ),
      adjustments: lotChanges,
      suppliers,
    };
  }

  async expiring(actorId: string, organizationId: string, branchId: string) {
    const lots = await this.stock(actorId, organizationId, branchId);
    const limit = new Date();
    limit.setDate(limit.getDate() + 90);
    return lots.filter((lot) => lot.expiresAt && lot.expiresAt <= limit);
  }

  /**
   * Ingresos y ajustes de la sucursal del rango pedido, por defecto los
   * últimos 90 días (SISTEMA-74): antes traía todo el historial.
   */
  async history(
    actorId: string,
    organizationId: string,
    branchId: string,
    filtro: { desde?: string; hasta?: string } = {},
  ) {
    await this.assert(actorId, organizationId, "INVENTORY_READ");
    await this.branch(organizationId, branchId);
    const { inicio, fin } = rangoDeHistorial(filtro);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        branchId,
        occurredAt: { gte: inicio, ...(fin ? { lte: fin } : {}) },
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
    // Por tandas y sin repetidos: un `IN` por movimiento excede el límite de
    // parámetros de PostgreSQL con historiales grandes (SISTEMA-74).
    const [products, lots] = await Promise.all([
      enTandas(
        movements.map((item) => item.productId),
        (tanda) =>
          this.prisma.product.findMany({
            where: { organizationId, id: { in: tanda } },
            select: { id: true, name: true },
          }),
      ),
      enTandas(
        movements.flatMap((item) => (item.lotId ? [item.lotId] : [])),
        (tanda) =>
          this.prisma.productLot.findMany({
            where: { organizationId, branchId, id: { in: tanda } },
            select: { id: true, number: true },
          }),
      ),
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
      supplierId: string | null;
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
      if (
        input.supplierId &&
        !(await tx.supplier.findFirst({
          where: {
            id: input.supplierId,
            organizationId: input.organizationId,
            active: true,
          },
        }))
      )
        throw new NotFoundException("El proveedor no está disponible.");
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
          unitCostMinor: BigInt(input.unitCostMinor),
          supplierId: input.supplierId,
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
          supplierId: input.supplierId,
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
      supplierId?: string | null;
      unitCostMinor?: number;
    },
  ) {
    await this.assert(actorId, input.organizationId, "INVENTORY_MANAGE");
    if (input.unitCostMinor !== undefined && input.quantity < 0)
      throw new BadRequestException(
        "El costo solo se indica al sumar unidades.",
      );
    if (!input.quantity)
      throw new ForbiddenException(
        "La variación de cantidad no puede ser 0: no modificaría el stock. Ingresá un número positivo para sumar unidades o negativo para restarlas. Para dejar el lote en cero, restá su cantidad actual.",
      );
    return this.prisma.$transaction(async (tx) => {
      // Dos ajustes a la vez no pueden pasarse de lo que tiene el proveedor.
      await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${input.lotId}::uuid FOR UPDATE`;
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
      await this.assertAdjustmentSupplier(tx, lot, input);
      const updated = await tx.productLot.update({
        where: { id: lot.id },
        data: {
          quantity: { increment: input.quantity },
          // Igual que una recepción: el costo del lote pasa a ser el último.
          ...(input.unitCostMinor === undefined
            ? {}
            : {
                unitCostMinor: BigInt(input.unitCostMinor),
                metadataVersion: { increment: 1 },
              }),
        },
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
          referenceType:
            input.supplierId === undefined ? "ADJUSTMENT" : SUPPLIER_ADJUSTMENT,
          supplierId: input.supplierId ?? null,
          ...(input.unitCostMinor === undefined
            ? {}
            : { unitCostMinor: BigInt(input.unitCostMinor) }),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        actorId,
        entityType: "PRODUCT_LOT",
        entityId: lot.id,
        action: "STOCK_ADJUSTED",
        before: {
          quantity: lot.quantity,
          unitCostMinor: lot.unitCostMinor.toString(),
        },
        after: {
          quantity: updated.quantity,
          delta: input.quantity,
          reason: input.reason.trim(),
          ...(input.supplierId === undefined
            ? {}
            : { supplierId: input.supplierId }),
          ...(input.unitCostMinor === undefined
            ? {}
            : { unitCostMinor: String(input.unitCostMinor) }),
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
      supplierId: string | null;
      lotId: string;
      quantity: number;
      reason: string;
    },
  ) {
    await this.assert(actorId, input.organizationId, "INVENTORY_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      // Dos devoluciones a la vez no pueden pasarse del límite del proveedor.
      await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${input.lotId}::uuid FOR UPDATE`;
      const [supplier, lot] = await Promise.all([
        input.supplierId
          ? tx.supplier.findFirst({
              where: {
                id: input.supplierId,
                organizationId: input.organizationId,
                active: true,
              },
            })
          : null,
        tx.productLot.findFirst({
          where: {
            id: input.lotId,
            organizationId: input.organizationId,
            branchId: input.branchId,
          },
        }),
      ]);
      if (input.supplierId && !supplier)
        throw new NotFoundException("Supplier is unavailable.");
      if (!lot || lot.quantity < input.quantity)
        throw new ForbiddenException("Insufficient stock for supplier return.");
      const { suppliers, unassigned } = await this.lotStockBySupplier(tx, lot);
      // A quien entregó el lote solo se le devuelve lo suyo. El stock sin
      // proveedor sale sin proveedor o a uno que no figura en el lote.
      const delivered = supplier ? suppliers.has(supplier.id) : false;
      if (!delivered && !unassigned)
        throw new ForbiddenException(
          supplier
            ? "Este lote no entró por ese proveedor. Elegí uno de los proveedores del lote."
            : "Todas las unidades de este lote tienen proveedor. Elegí uno.",
        );
      const limit = delivered ? suppliers.get(supplier!.id)! : unassigned;
      if (input.quantity > limit)
        throw new ForbiddenException(
          `${supplier ? "A ese proveedor solo se le pueden devolver" : "Sin proveedor solo se pueden devolver"} ${limit} un. de este lote.`,
        );
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

  /** Lo que tiene hoy cada proveedor activo del lote y lo que queda sin proveedor. */
  private async lotStockBySupplier(
    tx: Prisma.TransactionClient,
    lot: { id: string; quantity: number },
  ) {
    const breakdown = lotSupplierBreakdown(
      lot.quantity,
      (await loadLotHistories(tx, [lot.id])).get(lot.id)!,
    );
    const activeSuppliers = await tx.supplier.findMany({
      where: {
        id: { in: [...breakdown.keys()].filter((id) => id !== null) },
        active: true,
      },
      select: { id: true },
    });
    return lotReturnableStock(
      breakdown,
      new Set(activeSuppliers.map((item) => item.id)),
    );
  }

  /** Restar sale de quien tiene unidades; sumar puede ser de cualquier proveedor activo. */
  private async assertAdjustmentSupplier(
    tx: Prisma.TransactionClient,
    lot: { id: string; quantity: number },
    input: {
      organizationId: string;
      quantity: number;
      supplierId?: string | null;
    },
  ) {
    const { supplierId, quantity } = input;
    if (
      supplierId &&
      !(await tx.supplier.findFirst({
        where: {
          id: supplierId,
          organizationId: input.organizationId,
          active: true,
        },
      }))
    )
      throw new NotFoundException("El proveedor no está disponible.");
    if (quantity > 0) return;
    const { suppliers, unassigned } = await this.lotStockBySupplier(tx, lot);
    if (supplierId === undefined) {
      const origins =
        [...suppliers.values()].filter(Boolean).length + (unassigned ? 1 : 0);
      if (origins > 1)
        throw new BadRequestException(
          "Este lote tiene varios proveedores. Elegí de cuál son las unidades.",
        );
      return;
    }
    const limit = supplierId ? (suppliers.get(supplierId) ?? 0) : unassigned;
    if (-quantity > limit)
      throw new ForbiddenException(
        `${supplierId ? "Ese proveedor tiene" : "Sin proveedor hay"} ${limit} un. en este lote.`,
      );
  }

  private async branch(organizationId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId, active: true },
    });
    if (!branch) throw new NotFoundException("Branch is unavailable.");
  }

  private async permissionCodes(actorId: string, organizationId: string) {
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
    if (!membership?.active) return new Set<string>();
    return new Set(
      membership.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.code),
      ),
    );
  }

  private async assert(actorId: string, organizationId: string, code: string) {
    if (!(await this.permissionCodes(actorId, organizationId)).has(code))
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
