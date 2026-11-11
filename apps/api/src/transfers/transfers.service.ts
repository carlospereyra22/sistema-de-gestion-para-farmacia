import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  loadLotHistories,
  lotSupplierBreakdown,
} from "../inventory/lot-suppliers";
import { AuditService } from "../audit/audit.service";
import {
  contextoSinConexion,
  guardarOperacionSinConexion,
  operacionYaRegistrada,
  type ContextoSinConexion,
} from "../common/offline/registro-sin-conexion";
import { PrismaService } from "../prisma/prisma.service";
import { verificarOperacionDeOtro } from "../sales/operacion-firmada";
import {
  KIND_TRANSFERENCIA,
  descuentoDeDespacho,
  type OperacionTransferenciaSinConexion,
  type RenglonTransferencia,
} from "./transferencia-sin-conexion";

/** Terminadas que muestra la lista; las en curso van siempre todas. */
export const TERMINADAS_EN_LISTA = 50;

type Alcance = {
  actorId: string;
  organizationId: string;
  branchId: string;
};

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  /**
   * Las que están en curso (preparadas o en tránsito), todas, y las últimas
   * terminadas. La lista no crece para siempre: la PC la precarga cada 10
   * minutos (SISTEMA-71).
   */
  async list(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId);
    const deLaSucursal = {
      organizationId,
      OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }],
    };
    const [enCurso, terminadas] = await Promise.all([
      this.prisma.transfer.findMany({
        where: {
          ...deLaSucursal,
          status: { in: ["DRAFT", "PREPARED", "IN_TRANSIT"] },
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.transfer.findMany({
        where: { ...deLaSucursal, status: { in: ["RECEIVED", "CANCELLED"] } },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: TERMINADAS_EN_LISTA,
      }),
    ]);
    return [...enCurso, ...terminadas].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  async create(
    actorId: string,
    organizationId: string,
    sourceBranchId: string,
    input: {
      destinationBranchId: string;
      items: RenglonTransferencia[];
      clientOperationId?: string;
    },
  ) {
    await this.assert(actorId, organizationId);
    return this.prisma.$transaction((tx) =>
      this.prepararEnTx(
        tx,
        { actorId, organizationId, branchId: sourceBranchId },
        input,
      ),
    );
  }
  async dispatch(
    actorId: string,
    organizationId: string,
    sourceBranchId: string,
    id: string,
  ) {
    await this.assert(actorId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.bloquear(tx, organizationId, id);
      if (
        !transfer ||
        transfer.sourceBranchId !== sourceBranchId ||
        transfer.status !== "PREPARED"
      )
        throw new NotFoundException(
          "La transferencia preparada no está disponible.",
        );
      return this.despacharEnTx(
        tx,
        { actorId, organizationId, branchId: sourceBranchId },
        transfer,
      );
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
      const transfer = await this.bloquear(tx, organizationId, id);
      if (
        !transfer ||
        transfer.destinationBranchId !== destinationBranchId ||
        transfer.status !== "IN_TRANSIT"
      )
        throw new NotFoundException(
          "La transferencia en camino no está disponible.",
        );
      return this.recibirEnTx(
        tx,
        { actorId, organizationId, branchId: destinationBranchId },
        transfer,
      );
    });
  }
  /**
   * Transferencia preparada, despachada o recibida sin conexión (SISTEMA-71),
   * que la PC manda al volver. Se registra una sola vez, con su hora real y en
   * una sola transacción con sus avisos.
   */
  async completeOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionTransferenciaSinConexion,
    reenviadaPor?: string,
  ) {
    await this.assert(actorId, organizationId);
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: KIND_TRANSFERENCIA[op.tipo],
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio: { tipo: op.tipo, cuerpo: op.cuerpo },
      reenviadaPor,
      permitirSoloLectura: op.tipo === "RECIBIR",
    });
    const alcance = { actorId, organizationId, branchId };
    return this.prisma.$transaction(async (tx) => {
      const registrada = await operacionYaRegistrada(
        tx,
        organizationId,
        contexto,
      );
      if (registrada) return registrada;
      const entityId =
        op.tipo === "PREPARAR"
          ? (
              await this.prepararEnTx(
                tx,
                alcance,
                { ...op.cuerpo, clientOperationId: op.clientOperationId },
                contexto,
              )
            ).id
          : await this.avanzarSinConexion(
              tx,
              alcance,
              op.tipo,
              op.cuerpo.transferId,
              contexto,
            );
      return guardarOperacionSinConexion(tx, contexto, {
        organizationId,
        branchId,
        actorId,
        entityId,
      });
    });
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  async completeOfflineSigned(
    senderId: string,
    organizationId: string,
    branchId: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionTransferenciaSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.completeOffline(senderId, organizationId, branchId, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId,
      branchId,
    });
    try {
      await this.assert(firma.actorId, organizationId);
    } catch {
      throw new BadRequestException(
        "Quien hizo la transferencia ya no puede manejar inventario. Revisala a mano.",
      );
    }
    return this.completeOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
      senderId,
    );
  }
  /**
   * Despacho o recepción sin conexión. Si otra PC ya lo hizo, no se mueve stock
   * otra vez: queda registrada con aviso.
   */
  private async avanzarSinConexion(
    tx: Prisma.TransactionClient,
    alcance: Alcance,
    tipo: "DESPACHAR" | "RECIBIR",
    transferId: string,
    contexto: ContextoSinConexion,
  ) {
    const { organizationId, branchId } = alcance;
    const transfer = await this.bloquear(tx, organizationId, transferId);
    const propia =
      tipo === "DESPACHAR"
        ? transfer?.sourceBranchId === branchId
        : transfer?.destinationBranchId === branchId;
    if (!transfer || !propia)
      throw new NotFoundException(
        "La transferencia no está disponible en esta sucursal.",
      );
    if (tipo === "DESPACHAR") {
      if (transfer.status === "PREPARED") {
        await this.despacharEnTx(tx, alcance, transfer, contexto);
        return transfer.id;
      }
      if (transfer.status === "IN_TRANSIT" || transfer.status === "RECEIVED") {
        contexto.avisos.push({
          kind: "TRANSFERENCIA_YA_DESPACHADA",
          detail: {
            motivo:
              "Otra PC ya había despachado esta transferencia: no se descontó stock otra vez.",
            transferId: transfer.id,
          },
        });
        return transfer.id;
      }
      throw new BadRequestException(
        "La transferencia fue cancelada: no se puede despachar.",
      );
    }
    if (transfer.status === "IN_TRANSIT") {
      await this.recibirEnTx(tx, alcance, transfer, contexto);
      return transfer.id;
    }
    if (transfer.status === "RECEIVED") {
      contexto.avisos.push({
        kind: "TRANSFERENCIA_YA_RECIBIDA",
        detail: {
          motivo:
            "Otra PC ya había recibido esta transferencia: no se sumó stock otra vez.",
          transferId: transfer.id,
        },
      });
      return transfer.id;
    }
    throw new BadRequestException(
      transfer.status === "CANCELLED"
        ? "La transferencia fue cancelada: no se puede recibir."
        : "La transferencia todavía no fue despachada: no se puede recibir.",
    );
  }
  /** Busca la transferencia por id o por su clave y la bloquea para actualizar. */
  private async bloquear(
    tx: Prisma.TransactionClient,
    organizationId: string,
    idOClave: string,
  ) {
    const encontrada = await tx.transfer.findFirst({
      where: {
        organizationId,
        OR: [{ id: idOClave }, { clientOperationId: idOClave }],
      },
      select: { id: true },
    });
    if (!encontrada) return null;
    await tx.$queryRaw`SELECT id FROM "Transfer" WHERE id = ${encontrada.id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    return tx.transfer.findUniqueOrThrow({
      where: { id: encontrada.id },
      include: { items: true },
    });
  }
  /**
   * Prepara la transferencia. Preparar no mueve stock: sin conexión se crea
   * aunque el lote ya no alcance, con aviso; el choque real es al despachar.
   */
  private async prepararEnTx(
    tx: Prisma.TransactionClient,
    alcance: Alcance,
    input: {
      destinationBranchId: string;
      items: RenglonTransferencia[];
      clientOperationId?: string;
    },
    contexto?: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId: sourceBranchId } = alcance;
    if (input.clientOperationId) {
      const previa = await tx.transfer.findUnique({
        where: {
          organizationId_clientOperationId: {
            organizationId,
            clientOperationId: input.clientOperationId,
          },
        },
      });
      // Ya llegó con conexión (la respuesta se perdió): no se repite.
      if (previa) return previa;
    }
    if (!input.items.length)
      throw new BadRequestException(
        "La transferencia necesita al menos un producto.",
      );
    if (sourceBranchId === input.destinationBranchId)
      throw new BadRequestException(
        "La sucursal de origen y la de destino tienen que ser distintas.",
      );
    const destination = await tx.branch.findFirst({
      where: { id: input.destinationBranchId, organizationId, active: true },
    });
    if (!destination)
      throw new BadRequestException(
        "La sucursal de destino no está disponible.",
      );
    const lots = [];
    for (const item of input.items) {
      const lot = await tx.productLot.findFirst({
        where: {
          organizationId,
          branchId: sourceBranchId,
          ...(item.lotId
            ? { id: item.lotId }
            : { productId: item.productId, number: item.lotNumber }),
        },
      });
      if (!lot)
        throw new BadRequestException(
          contexto
            ? "Un lote de la transferencia no existe en la sucursal de origen."
            : "No hay stock suficiente para la transferencia.",
        );
      if (lot.quantity < item.quantity) {
        if (!contexto)
          throw new BadRequestException(
            "No hay stock suficiente para la transferencia.",
          );
        contexto.avisos.push({
          kind: "STOCK_FALTANTE",
          detail: {
            motivo:
              "Al preparar la transferencia el lote ya no tenía todo ese stock.",
            nombre: await this.nombreDe(tx, lot.productId),
            lote: lot.number,
            productId: lot.productId,
            lotId: lot.id,
            pedido: item.quantity,
            disponible: lot.quantity,
          },
        });
      }
      lots.push({ lot, quantity: item.quantity });
    }
    if (new Set(lots.map(({ lot }) => lot.id)).size !== lots.length)
      throw new BadRequestException(
        "Cada lote puede aparecer una sola vez en la transferencia.",
      );
    const transfer = await tx.transfer.create({
      data: {
        organizationId,
        sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        status: "PREPARED",
        clientOperationId: input.clientOperationId,
        ...(contexto ? { createdAt: contexto.occurredAt } : {}),
      },
    });
    await tx.transferItem.createMany({
      data: lots.map(({ lot, quantity }) => ({
        transferId: transfer.id,
        lotId: lot.id,
        productId: lot.productId,
        quantity,
      })),
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
        items: lots.map(({ lot, quantity }) => ({ lotId: lot.id, quantity })),
        ...this.origen(contexto),
      },
    });
    return transfer;
  }
  /**
   * Descuenta el stock del origen. Con conexión, si no alcanza se rechaza. Sin
   * conexión la mercadería ya salió: el lote queda en cero (nunca negativo) y
   * lo que falta queda como aviso para revisar el origen.
   */
  private async despacharEnTx(
    tx: Prisma.TransactionClient,
    alcance: Alcance,
    transfer: {
      id: string;
      items: {
        lotId: string;
        productId: string;
        quantity: number;
      }[];
    },
    contexto?: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId } = alcance;
    for (const item of transfer.items) {
      await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id = ${item.lotId}::uuid FOR UPDATE`;
      const lot = await tx.productLot.findUniqueOrThrow({
        where: { id: item.lotId },
      });
      const { descontar, faltan } = descuentoDeDespacho(
        lot.quantity,
        item.quantity,
      );
      if (faltan > 0) {
        if (!contexto)
          throw new BadRequestException(
            `El lote ${lot.number} tiene ${lot.quantity} unidades y la transferencia lleva ${item.quantity}. Revisá el stock antes de despachar.`,
          );
        contexto.avisos.push({
          kind: "STOCK_FALTANTE",
          detail: {
            motivo:
              "Se despachó sin conexión más de lo que tenía el lote: quedó en cero. Revisá el stock de origen.",
            nombre: await this.nombreDe(tx, item.productId),
            lote: lot.number,
            productId: item.productId,
            lotId: item.lotId,
            enviado: item.quantity,
            faltan,
          },
        });
      }
      if (descontar > 0) {
        await tx.productLot.update({
          where: { id: item.lotId },
          data: { quantity: { decrement: descontar } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            branchId,
            productId: item.productId,
            lotId: item.lotId,
            type: "TRANSFER_OUT",
            quantity: -descontar,
            actorId,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            ...(contexto ? { occurredAt: contexto.occurredAt } : {}),
          },
        });
      }
    }
    const updated = await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: "IN_TRANSIT" },
    });
    await this.audit.recordInTransaction(tx, {
      organizationId,
      branchId,
      actorId,
      entityType: "TRANSFER",
      entityId: transfer.id,
      action: "DISPATCHED",
      before: { status: "PREPARED" },
      after: { status: "IN_TRANSIT", ...this.origen(contexto) },
    });
    return updated;
  }
  private async recibirEnTx(
    tx: Prisma.TransactionClient,
    alcance: Alcance,
    transfer: {
      id: string;
      items: {
        lotId: string;
        productId: string;
        quantity: number;
      }[];
    },
    contexto?: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId: destinationBranchId } = alcance;
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
      // El lote conserva su origen: lo transferido es lo más viejo del lote,
      // así que se reparte por proveedor con ese mismo criterio.
      const history = (await loadLotHistories(tx, [sourceLot.id])).get(
        sourceLot.id,
      )!;
      const after = lotSupplierBreakdown(sourceLot.quantity, history);
      const before = lotSupplierBreakdown(
        sourceLot.quantity + item.quantity,
        history,
      );
      for (const [supplierId, quantity] of before) {
        const moved = quantity - (after.get(supplierId) ?? 0);
        if (moved > 0)
          await tx.inventoryMovement.create({
            data: {
              organizationId,
              branchId: destinationBranchId,
              productId: item.productId,
              lotId: lot.id,
              type: "TRANSFER_IN",
              quantity: moved,
              supplierId,
              actorId,
              referenceType: "TRANSFER",
              referenceId: transfer.id,
              ...(contexto ? { occurredAt: contexto.occurredAt } : {}),
            },
          });
      }
    }
    const updated = await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: "RECEIVED" },
    });
    await this.audit.recordInTransaction(tx, {
      organizationId,
      branchId: destinationBranchId,
      actorId,
      entityType: "TRANSFER",
      entityId: transfer.id,
      action: "RECEIVED",
      before: { status: "IN_TRANSIT" },
      after: { status: "RECEIVED", ...this.origen(contexto) },
    });
    return updated;
  }
  private async nombreDe(tx: Prisma.TransactionClient, productId: string) {
    return (
      (
        await tx.product.findUnique({
          where: { id: productId },
          select: { name: true },
        })
      )?.name ?? "Producto"
    );
  }
  private origen(contexto?: ContextoSinConexion) {
    return contexto
      ? {
          origen: "SIN_CONEXION",
          deviceId: contexto.deviceId,
          occurredAt: contexto.occurredAt.toISOString(),
        }
      : {};
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
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
