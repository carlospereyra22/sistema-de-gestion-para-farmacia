import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CashMovementType, Prisma } from "@prisma/client";
import { lockCashSession } from "./lock-cash-session";
import { findOwnOpenSession } from "./own-open-session";
import { randomUUID } from "node:crypto";
import { readReceiptPayments } from "../accounts/receipt-payments";
import { liberarFacturaEnEspera } from "../fiscal/factura-diferida";
import { offlineOccurredAt } from "../sales/offline-sale";
import { firmaValida } from "../sales/firma-venta";
import { subscriptionAccessAt } from "../platform/subscription-access";
import { subscriptionDenied } from "../platform/subscription-gate";
import {
  KIND_POR_TIPO,
  hashOperacionCaja,
  sesionReal,
  TIPOS_DE_COBRO,
  validarOperacionCaja,
  type OperacionCajaSinConexion,
} from "./offline-cash";
import { isOrganizationAdministrator } from "../roles/administrator-role";
import {
  cashMovementCategory,
  formatCashMinor,
  saleChangeMinor,
} from "./cash-movement-category";
import {
  readCashSettings,
  defaultCashSettings,
  cashSettingsView,
} from "./cash-settings";
import { sinClaveRegistrada } from "../sales/operacion-firmada";

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async settings(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "CASH_READ");
    await this.branch(organizationId, branchId);
    return readCashSettings(this.prisma, branchId);
  }
  async saveSettings(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: typeof defaultCashSettings,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const before = await readCashSettings(tx, branchId);
      const { version, ...values } = input;
      if (before.version !== version) {
        if (
          Object.entries(values).every(
            ([key, value]) => before[key as keyof typeof values] === value,
          )
        )
          return before;
        throw new ConflictException(
          "Las reglas cambiaron en otro equipo. Volvé a abrir la configuración antes de guardar.",
        );
      }
      if (input.defaultRegisterId) {
        await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${input.defaultRegisterId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
        if (
          !(await tx.cashRegister.findFirst({
            where: { id: input.defaultRegisterId, branchId, active: true },
          }))
        )
          throw new BadRequestException(
            "La caja predeterminada debe estar habilitada en esta sucursal.",
          );
      }
      const after = await tx.cashSettings.upsert({
        where: { branchId },
        create: { organizationId, branchId, ...values, version: 1 },
        update: { ...values, version: { increment: 1 } },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_SETTINGS",
        entityId: branchId,
        action: "UPDATED",
        before,
        after,
      });
      return cashSettingsView(after);
    });
  }
  async management(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "CASH_READ");
    await this.branch(organizationId, branchId);
    const membership = await this.prisma.userOrganization.findUniqueOrThrow({
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
    return {
      canArchive: isOrganizationAdministrator(membership.roles),
      canManage: membership.roles.some(({ role }) =>
        role.permissions.some(
          ({ permission }) => permission.code === "CASH_MANAGE",
        ),
      ),
      registers: await this.prisma.cashRegister.findMany({
        where: { branchId },
        orderBy: { name: "asc" },
      }),
    };
  }
  async pendingCollections(
    actorId: string,
    organizationId: string,
    branchId: string,
  ) {
    await this.assert(actorId, organizationId, "CASH_READ");
    await this.branch(organizationId, branchId);
    const rows = await this.prisma.cashPendingCollection.findMany({
      where: { organizationId, branchId, assignedAt: null, voidedAt: null },
      orderBy: [{ collectedAt: "asc" }, { id: "asc" }],
    });
    const names = await this.memberLabels(
      organizationId,
      rows.map((row) => row.actorId),
    );
    // Ventas con factura esperando este cobro: al incorporarlo se emite.
    const ventas = rows
      .filter((row) => row.sourceType === "SALE")
      .map((row) => row.sourceId);
    const enEspera = new Set(
      ventas.length
        ? [
            ...(await this.prisma.fiscalDocument.findMany({
              where: {
                organizationId,
                sourceSaleId: { in: ventas },
                kind: "INVOICE",
                status: "HELD",
              },
              select: { sourceSaleId: true },
            })),
            ...(await this.prisma.fiscalTrial.findMany({
              where: {
                organizationId,
                sourceSaleId: { in: ventas },
                status: "HELD",
              },
              select: { sourceSaleId: true },
            })),
          ].map((documento) => documento.sourceSaleId)
        : [],
    );
    return rows.map((row) => ({
      ...row,
      facturaEnEspera: row.sourceType === "SALE" && enEspera.has(row.sourceId),
      collectedBy: names.get(row.actorId) ?? null,
      cashMinor: row.cashMinor.toString(),
      cardMinor: row.cardMinor.toString(),
      transferMinor: row.transferMinor.toString(),
      changeMinor: row.changeMinor.toString(),
    }));
  }

  async assignCollection(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    sessionId: string,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.cashPendingCollection.findFirst({
        where: { id, organizationId, branchId },
      });
      if (!original)
        throw new NotFoundException("Cobro pendiente no disponible.");
      // Cancellation and assignment share the sale lock, before the collection/session locks.
      if (original.sourceType === "SALE") {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${original.sourceId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
        const sale = await tx.sale.findFirst({
          where: {
            id: original.sourceId,
            organizationId,
            branchId,
            status: "COMPLETED",
          },
        });
        if (!sale)
          throw new ConflictException(
            "La venta fue anulada o ya no está disponible.",
          );
      }
      await tx.$queryRaw`SELECT id FROM "CashPendingCollection" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.cashPendingCollection.findUniqueOrThrow({
        where: { id },
      });
      if (row.voidedAt) throw new ConflictException("El cobro fue anulado.");
      if (row.assignedAt) {
        if (row.assignedSessionId !== sessionId)
          throw new ConflictException(
            "El cobro ya fue asignado a otra sesión.",
          );
        return { id, assignedSessionId: sessionId, assignedAt: row.assignedAt };
      }
      await lockCashSession(tx, sessionId);
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId, closedAt: null },
      });
      if (
        row.destinationRegisterId &&
        session?.cashRegisterId !== row.destinationRegisterId
      )
        throw new ConflictException(
          "La sesión no corresponde a la caja asignada al cobro.",
        );
      if (
        !session ||
        !(await tx.cashRegister.findFirst({
          where: { id: session.cashRegisterId, branchId, active: true },
        }))
      )
        throw new ConflictException(
          "Seleccioná una sesión abierta de esta sucursal.",
        );
      const assignedAt = new Date();
      return this.incorporarCobro(tx, {
        actorId,
        organizationId,
        branchId,
        row,
        sessionId,
        assignedAt,
      });
    });
  }

  /**
   * Incorpora un cobro pendiente a una sesión: su efectivo entra una sola vez
   * como movimiento, y la factura que esperaba la caja pasa a la cola fiscal.
   * También lo usa el cobro incorporado sin conexión (SISTEMA-81).
   */
  private async incorporarCobro(
    tx: Prisma.TransactionClient,
    datos: {
      actorId: string;
      organizationId: string;
      branchId: string;
      row: {
        id: string;
        sourceType: string;
        sourceId: string;
        collectedAt: Date;
        cashMinor: bigint;
        cardMinor: bigint;
        transferMinor: bigint;
        changeMinor: bigint;
      };
      sessionId: string;
      assignedAt: Date;
      origen?: Record<string, string>;
    },
  ) {
    const { actorId, organizationId, branchId, row, sessionId, assignedAt } =
      datos;
    const id = row.id;
    {
      // Source payments remain untouched. Cash is incorporated exactly once as an allocation entry.
      if (row.cashMinor > 0n)
        await tx.cashMovement.create({
          data: {
            cashSessionId: sessionId,
            type: "IN",
            amountMinor: row.cashMinor,
            actorId,
            reason: `Asignación de cobro sin caja · ${row.sourceType === "SALE" ? "Venta" : "Recibo"} ${row.sourceId} · ${row.collectedAt.toISOString()}`,
            ...(datos.origen ? { createdAt: assignedAt } : {}),
          },
        });
      await tx.cashPendingCollection.update({
        where: { id },
        data: {
          assignedSessionId: sessionId,
          assignedAt,
          assignedById: actorId,
        },
      });
      // La factura pedida con la caja cerrada esperaba este momento: pasa a
      // la cola fiscal, que la emite con la fecha de hoy (SISTEMA-65).
      const facturaLiberada =
        row.sourceType === "SALE" &&
        (await liberarFacturaEnEspera(tx, {
          organizationId,
          branchId,
          saleId: row.sourceId,
          actorId,
          ahora: assignedAt,
        }));
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_PENDING_COLLECTION",
        entityId: id,
        action: "ASSIGNED",
        after: {
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          collectedAt: row.collectedAt.toISOString(),
          cashSessionId: sessionId,
          cashMinor: row.cashMinor.toString(),
          cardMinor: row.cardMinor.toString(),
          transferMinor: row.transferMinor.toString(),
          changeMinor: row.changeMinor.toString(),
          facturaLiberada,
          ...(datos.origen ?? {}),
        },
      });
      return { id, assignedSessionId: sessionId, assignedAt, facturaLiberada };
    }
  }
  async setCollectionDestination(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    registerId: string,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.cashPendingCollection.findFirst({
        where: { id, organizationId, branchId },
      });
      if (!original)
        throw new NotFoundException("Cobro pendiente no disponible.");
      if (original.sourceType === "SALE") {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${original.sourceId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
        if (
          !(await tx.sale.findFirst({
            where: {
              id: original.sourceId,
              organizationId,
              branchId,
              status: "COMPLETED",
            },
          }))
        )
          throw new ConflictException(
            "La venta fue anulada o ya no está disponible.",
          );
      }
      await tx.$queryRaw`SELECT id FROM "CashPendingCollection" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.cashPendingCollection.findUniqueOrThrow({
        where: { id },
      });
      if (row.voidedAt || row.assignedAt)
        throw new ConflictException(
          "El cobro fue anulado o ya se incorporó a una sesión.",
        );
      if (row.destinationRegisterId) {
        if (row.destinationRegisterId !== registerId)
          throw new ConflictException("El cobro ya fue asignado a otra caja.");
        return { id, destinationRegisterId: registerId };
      }
      await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${registerId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
      if (
        !(await tx.cashRegister.findFirst({
          where: { id: registerId, branchId, active: true },
        }))
      )
        throw new ConflictException(
          "Seleccioná una caja habilitada de esta sucursal.",
        );
      await tx.cashPendingCollection.update({
        where: { id },
        data: {
          destinationRegisterId: registerId,
          destinationSetAt: new Date(),
          destinationSetById: actorId,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_PENDING_COLLECTION",
        entityId: id,
        action: "DESTINATION_ASSIGNED",
        after: {
          cashRegisterId: registerId,
          sourceId: row.sourceId,
          collectedAt: row.collectedAt.toISOString(),
        },
      });
      return { id, destinationRegisterId: registerId };
    });
  }
  /** Deshace la asignación de caja. Sólo cambia el destino: nunca mueve dinero. */
  async clearCollectionDestination(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    expectedRegisterId: string,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CashPendingCollection" WHERE id=${id}::uuid AND "organizationId"=${organizationId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
      const row = await tx.cashPendingCollection.findFirst({
        where: { id, organizationId, branchId },
      });
      if (!row) throw new NotFoundException("Cobro pendiente no disponible.");
      if (row.voidedAt || row.assignedAt)
        throw new ConflictException(
          "El cobro fue anulado o ya se incorporó a una sesión.",
        );
      // Reintento de una solicitud que ya se aplicó.
      if (!row.destinationRegisterId)
        return { id, destinationRegisterId: null };
      if (row.destinationRegisterId !== expectedRegisterId)
        throw new ConflictException(
          "El cobro cambió de caja. Actualizá y volvé a intentarlo.",
        );
      await tx.cashPendingCollection.update({
        where: { id },
        data: {
          destinationRegisterId: null,
          destinationSetAt: null,
          destinationSetById: null,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_PENDING_COLLECTION",
        entityId: id,
        action: "DESTINATION_CLEARED",
        before: {
          cashRegisterId: row.destinationRegisterId,
          destinationSetAt: row.destinationSetAt?.toISOString() ?? null,
          destinationSetById: row.destinationSetById,
          sourceId: row.sourceId,
          collectedAt: row.collectedAt.toISOString(),
        },
      });
      return { id, destinationRegisterId: null };
    });
  }
  async editRegister(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    input: {
      name: string;
      active: boolean;
      expectedName: string;
      expectedActive: boolean;
      responsibleName?: string | null;
      expectedResponsibleName?: string | null;
    },
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 100)
      throw new BadRequestException(
        "El nombre debe tener entre 2 y 100 caracteres.",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${id}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
        const before = await tx.cashRegister.findFirst({
          where: { id, branchId },
        });
        if (!before) throw new NotFoundException("Caja no disponible.");
        if (
          !input.active &&
          (await readCashSettings(tx, branchId)).defaultRegisterId === id
        )
          throw new ConflictException(
            "Elegí otra caja predeterminada antes de deshabilitar esta caja.",
          );
        if (
          before.name !== input.expectedName ||
          before.active !== input.expectedActive ||
          (input.responsibleName !== undefined &&
            (input.expectedResponsibleName === undefined ||
              (before.responsibleName ?? null) !==
                input.expectedResponsibleName))
        )
          throw new ConflictException(
            "La caja cambió en otro equipo. Actualizá antes de guardar.",
          );
        if (
          !input.active &&
          (await tx.cashPendingCollection.findFirst({
            where: {
              destinationRegisterId: id,
              assignedAt: null,
              voidedAt: null,
            },
          }))
        )
          throw new ConflictException(
            "Esta caja tiene cobros asignados pendientes de incorporar. Resolvelos antes de deshabilitarla.",
          );
        if (
          !input.active &&
          (await tx.cashSession.findFirst({
            where: { cashRegisterId: id, closedAt: null },
          }))
        )
          throw new ConflictException(
            "Cerrá la sesión abierta antes de eliminar esta caja del listado.",
          );
        const after = await tx.cashRegister.update({
          where: { id },
          data: {
            name,
            active: input.active,
            ...(input.responsibleName !== undefined
              ? { responsibleName: this.responsibleName(input.responsibleName) }
              : {}),
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "CASH_REGISTER",
          entityId: id,
          action: !input.active
            ? "ARCHIVED"
            : before.active
              ? "UPDATED"
              : "RESTORED",
          before: {
            name: before.name,
            active: before.active,
            responsibleName: before.responsibleName ?? null,
          },
          after: {
            name,
            active: input.active,
            responsibleName: after.responsibleName ?? null,
          },
        });
        return after;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe una caja con ese nombre, incluso entre las eliminadas.",
        );
      throw error;
    }
  }
  async archiveClosure(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
    archived: boolean,
    reason: string,
  ) {
    const access = await this.management(actorId, organizationId, branchId);
    if (!access.canArchive)
      throw new ForbiddenException(
        "Sólo un administrador puede eliminar o restaurar cierres.",
      );
    if (reason.trim().length < 3 || reason.length > 300)
      throw new BadRequestException("Indicá un motivo de 3 a 300 caracteres.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CashSession" WHERE id=${id}::uuid AND "cashRegisterId" IN (SELECT id FROM "CashRegister" WHERE "branchId"=${branchId}::uuid) FOR UPDATE`;
      const session = await tx.cashSession.findFirst({
        where: {
          id,
          cashRegisterId: { in: access.registers.map((r) => r.id) },
          closedAt: { not: null },
        },
      });
      if (!session)
        throw new NotFoundException("Cierre no disponible en esta sucursal.");
      if (Boolean(session.archivedAt) === archived) return { archived };
      await tx.cashSession.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_SESSION",
        entityId: id,
        action: archived ? "ARCHIVED" : "RESTORED",
        before: { archived: Boolean(session.archivedAt) },
        after: {
          archived,
          reason: reason.trim(),
          commercialMovementsPreserved: true,
        },
      });
      return { archived };
    });
  }
  async list(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "CASH_READ");
    const registers = await this.prisma.cashRegister.findMany({
      where: { branchId, active: true },
      orderBy: { name: "asc" },
    });
    const [openSessions, recentClosed] = await Promise.all([
      this.prisma.cashSession.findMany({
        where: {
          cashRegisterId: { in: registers.map((register) => register.id) },
          closedAt: null,
          archivedAt: null,
        },
        orderBy: { openedAt: "desc" },
        include: { movements: { orderBy: { createdAt: "desc" } } },
      }),
      this.prisma.cashSession.findMany({
        where: {
          cashRegisterId: { in: registers.map((register) => register.id) },
          closedAt: { not: null },
          archivedAt: null,
        },
        orderBy: { openedAt: "desc" },
        take: 20,
        include: { movements: { orderBy: { createdAt: "desc" } } },
      }),
    ]);
    const sessions = [...openSessions, ...recentClosed];
    const memberNames = await this.memberLabels(
      organizationId,
      sessions.flatMap((session) => [
        session.openedById,
        ...session.movements.map((movement) => movement.actorId),
      ]),
    );
    // La línea de tiempo sólo se arma para las sesiones que se están operando.
    const openPayments = openSessions.length
      ? await this.prisma.salePayment.findMany({
          where: {
            cashSessionId: { in: openSessions.map((session) => session.id) },
            method: "CASH",
            sale: { status: "COMPLETED" },
          },
          select: {
            id: true,
            saleId: true,
            cashSessionId: true,
            amountMinor: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const vendedores = await this.sellerLabels(
      organizationId,
      openPayments.map((payment) => payment.saleId),
    );
    return {
      registers,
      settings: await readCashSettings(this.prisma, branchId),
      sessions: (await this.summarizeSessions(sessions)).map((session) => ({
        ...session,
        cashPayments: openPayments
          .filter((payment) => payment.cashSessionId === session.id)
          .map((payment) => ({
            id: payment.id,
            saleId: payment.saleId,
            amountMinor: payment.amountMinor.toString(),
            createdAt: payment.createdAt,
            actorName: vendedores.get(payment.saleId) ?? null,
          })),
        openedBy:
          memberNames.get(
            sessions.find((row) => row.id === session.id)!.openedById,
          ) ?? null,
        openedByCurrentUser:
          sessions.find((row) => row.id === session.id)!.openedById === actorId,
        movements: session.movements.map((movement) => ({
          ...movement,
          actorName:
            memberNames.get(
              sessions
                .find((row) => row.id === session.id)!
                .movements.find((row) => row.id === movement.id)!.actorId,
            ) ?? null,
        })),
      })),
    };
  }
  /** Cajas de las sucursales asignadas al usuario, con quién tiene abierta cada una. */
  async organizationRegisters(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "CASH_READ");
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId,
        active: true,
        userMemberships: { some: { userId: actorId } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const registers = await this.prisma.cashRegister.findMany({
      where: { branchId: { in: branches.map((branch) => branch.id) } },
      orderBy: { name: "asc" },
    });
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        cashRegisterId: { in: registers.map((register) => register.id) },
        closedAt: null,
        archivedAt: null,
      },
      select: { cashRegisterId: true, openedById: true, openedAt: true },
    });
    const names = await this.memberLabels(
      organizationId,
      sessions.map((session) => session.openedById),
    );
    return {
      branches,
      registers: branches.flatMap((branch) =>
        registers
          .filter((register) => register.branchId === branch.id)
          .map((register) => {
            const session = sessions.find(
              (row) => row.cashRegisterId === register.id,
            );
            return {
              id: register.id,
              name: register.name,
              active: register.active,
              responsibleName: register.responsibleName,
              branchId: branch.id,
              branchName: branch.name,
              session: session
                ? {
                    openedAt: session.openedAt,
                    openedBy: names.get(session.openedById) ?? null,
                  }
                : null,
            };
          }),
      ),
    };
  }
  /** Actividad de efectivo de una caja en los últimos 7 días, sin cierres archivados. */
  async recentActivity(
    actorId: string,
    organizationId: string,
    branchId: string,
    registerId: string,
  ) {
    await this.assert(actorId, organizationId, "CASH_READ");
    await this.branch(organizationId, branchId);
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: registerId, branchId },
    });
    if (!register) throw new NotFoundException("La caja no está disponible.");
    const since = new Date(Date.now() - 7 * 86_400_000);
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        cashRegisterId: registerId,
        archivedAt: null,
        OR: [{ closedAt: null }, { closedAt: { gte: since } }],
      },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);
    const [movements, payments] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where: { cashSessionId: { in: sessionIds }, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.salePayment.findMany({
        where: {
          cashSessionId: { in: sessionIds },
          method: "CASH",
          createdAt: { gte: since },
          sale: { status: "COMPLETED" },
        },
        select: { id: true, saleId: true, amountMinor: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    const names = await this.memberLabels(
      organizationId,
      movements.map((row) => row.actorId),
    );
    return {
      movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amountMinor: movement.amountMinor.toString(),
        reason: movement.reason,
        createdAt: movement.createdAt,
        category: cashMovementCategory(movement.reason),
        actorName: names.get(movement.actorId) ?? null,
      })),
      cashPayments: await this.withSellers(organizationId, payments),
    };
  }
  async closures(
    actorId: string,
    organizationId: string,
    branchId: string,
    from?: string,
    to?: string,
    archived = false,
    cashRegisterId?: string,
    take?: number,
  ) {
    await this.assert(actorId, organizationId, "CASH_READ");
    await this.branch(organizationId, branchId);
    if (
      archived &&
      !(await this.management(actorId, organizationId, branchId)).canArchive
    )
      throw new ForbiddenException(
        "Sólo un administrador puede consultar cierres eliminados.",
      );
    // The latest closure is independent of the history's default 30-day window.
    const range =
      cashRegisterId && take === 1 && !from && !to
        ? { start: undefined, end: undefined }
        : this.dateRange(from, to);
    const registers = await this.prisma.cashRegister.findMany({
      where: { branchId, ...(cashRegisterId ? { id: cashRegisterId } : {}) },
      select: { id: true, name: true },
    });
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        cashRegisterId: { in: registers.map((register) => register.id) },
        closedAt: { not: null, gte: range.start, lte: range.end },
        archivedAt: archived ? { not: null } : null,
      },
      orderBy: { closedAt: "desc" },
      take,
      include: { movements: { orderBy: { createdAt: "desc" } } },
    });
    const names = new Map(
      registers.map((register) => [register.id, register.name]),
    );
    const summaries = await this.summarizeSessions(sessions);
    const closingAudits = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        branchId,
        entityType: "CASH_SESSION",
        entityId: { in: sessions.map((session) => session.id) },
        action: "CLOSED",
      },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, after: true },
    });
    const snapshots = new Map(
      closingAudits.map((audit) => [audit.entityId, audit.after]),
    );
    return summaries.map((session) => {
      const json = snapshots.get(session.id);
      const snapshot =
        json && typeof json === "object" && !Array.isArray(json)
          ? json
          : undefined;
      const expected =
        typeof snapshot?.expectedAmountMinor === "string" &&
        /^-?\d+$/.test(snapshot.expectedAmountMinor)
          ? snapshot.expectedAmountMinor
          : session.expectedAmountMinor;
      return {
        ...session,
        expectedAmountMinor: expected,
        differenceMinor:
          session.closingAmountMinor === null
            ? null
            : (
                BigInt(session.closingAmountMinor) - BigInt(expected)
              ).toString(),
        registerResponsibleName:
          typeof snapshot?.registerResponsibleName === "string"
            ? snapshot.registerResponsibleName
            : null,
        closedBy:
          typeof snapshot?.closedByName === "string"
            ? snapshot.closedByName
            : null,
        cashRegisterName:
          typeof snapshot?.cashRegisterName === "string"
            ? snapshot.cashRegisterName
            : (names.get(session.cashRegisterId) ?? "Caja"),
      };
    });
  }
  /**
   * Estado de cada caja activa de la sucursal para Inicio (SISTEMA-85): abierta o
   * cerrada y, si está abierta, el efectivo esperado con el mismo cálculo que Caja.
   * Solo lectura; el permiso y la sucursal los valida quien llama.
   */
  async branchRegistersStatus(branchId: string) {
    // La sucursal ya viene validada contra la organización (BranchAccessGuard).
    const registers = await this.prisma.cashRegister.findMany({
      where: { branchId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        closedAt: null,
        cashRegisterId: { in: registers.map((register) => register.id) },
      },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    });
    const summaries = new Map(
      (await this.summarizeSessions(sessions)).map((session) => [
        session.cashRegisterId,
        session,
      ]),
    );
    return registers.map((register) => {
      const session = summaries.get(register.id);
      return {
        id: register.id,
        name: register.name,
        open: Boolean(session),
        expectedAmountMinor: session?.expectedAmountMinor ?? null,
      };
    });
  }
  async closureDetail(
    actorId: string,
    organizationId: string,
    branchId: string,
    id: string,
  ) {
    const access = await this.management(actorId, organizationId, branchId);
    const session = await this.prisma.cashSession.findFirst({
      where: {
        id,
        closedAt: { not: null },
        cashRegisterId: { in: access.registers.map((register) => register.id) },
        ...(access.canArchive ? {} : { archivedAt: null }),
      },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    });
    if (!session)
      throw new NotFoundException("Cierre no disponible en esta sucursal.");
    const [summary] = await this.summarizeSessions([session]);
    const [audit, payments] = await Promise.all([
      this.prisma.auditLog.findFirst({
        where: {
          organizationId,
          branchId,
          entityType: "CASH_SESSION",
          entityId: id,
          action: "CLOSED",
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.salePayment.findMany({
        where: {
          cashSessionId: id,
          method: "CASH",
          sale: { organizationId, branchId, status: "COMPLETED" },
        },
        select: { id: true, saleId: true, amountMinor: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const snapshot =
      audit?.after &&
      typeof audit.after === "object" &&
      !Array.isArray(audit.after)
        ? audit.after
        : undefined;
    const savedExpected = snapshot?.expectedAmountMinor;
    const hasSnapshot =
      typeof savedExpected === "string" && /^-?\d+$/.test(savedExpected);
    const expected = hasSnapshot ? savedExpected : summary!.expectedAmountMinor;
    const actorIds = [
      ...new Set([
        session.openedById,
        ...(audit?.actorId ? [audit.actorId] : []),
        ...session.movements.map((movement) => movement.actorId),
      ]),
    ];
    const members = await this.prisma.userOrganization.findMany({
      where: { organizationId, userId: { in: actorIds } },
      select: { userId: true, displayName: true },
    });
    const names = new Map(
      members.map((member) => [member.userId, member.displayName]),
    );
    const name = (userId: string) =>
      names.get(userId) || `Usuario ${userId.slice(0, 8)}`;
    return {
      ...summary!,
      cashRegisterName:
        typeof snapshot?.cashRegisterName === "string"
          ? snapshot.cashRegisterName
          : (access.registers.find(
              (register) => register.id === session.cashRegisterId,
            )?.name ?? "Caja"),
      expectedAmountMinor: expected,
      differenceMinor:
        session.closingAmountMinor === null
          ? null
          : (session.closingAmountMinor - BigInt(expected)).toString(),
      snapshotAvailable: hasSnapshot,
      registerResponsibleName:
        typeof snapshot?.registerResponsibleName === "string"
          ? snapshot.registerResponsibleName
          : null,
      openedBy:
        typeof snapshot?.openedByName === "string"
          ? snapshot.openedByName
          : name(session.openedById),
      closedBy:
        typeof snapshot?.closedByName === "string"
          ? snapshot.closedByName
          : audit?.actorId
            ? name(audit.actorId)
            : null,
      reason: typeof snapshot?.reason === "string" ? snapshot.reason : null,
      archived: Boolean(session.archivedAt),
      movements: session.movements.map((movement) => ({
        ...movement,
        amountMinor: movement.amountMinor.toString(),
        actorName: name(movement.actorId),
      })),
      cashPayments: await this.withSellers(organizationId, payments),
    };
  }
  async createRegister(
    actorId: string,
    organizationId: string,
    branchId: string,
    name: string,
    code?: string,
    responsibleName?: string | null,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    try {
      const registerCode =
        code?.trim().toUpperCase() ||
        `CJ-${randomUUID().slice(0, 8).toUpperCase()}`;
      if (!/^[A-Z0-9_-]{2,30}$/.test(registerCode))
        throw new BadRequestException(
          "El código admite de 2 a 30 letras, números, guiones o guiones bajos.",
        );
      return await this.prisma.$transaction(async (tx) => {
        const register = await tx.cashRegister.create({
          data: {
            branchId,
            name: name.trim(),
            code: registerCode,
            responsibleName: this.responsibleName(responsibleName),
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "CASH_REGISTER",
          entityId: register.id,
          action: "CREATED",
          after: {
            name: register.name,
            code: register.code,
            responsibleName: register.responsibleName,
          },
        });
        return register;
      });
    } catch (cause) {
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe una caja con ese nombre o código en esta sucursal.",
        );
      throw cause;
    }
  }
  async open(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: { cashRegisterId: string; openingAmountMinor: number },
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${input.cashRegisterId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
      const rules = await readCashSettings(tx, branchId);
      if (
        !Number.isSafeInteger(input.openingAmountMinor) ||
        input.openingAmountMinor < 0
      )
        throw new BadRequestException("Ingresá un fondo inicial válido.");
      const openingAmountMinor = rules.askOpeningAmount
        ? input.openingAmountMinor
        : 0;
      const register = await tx.cashRegister.findFirst({
        where: { id: input.cashRegisterId, branchId, active: true },
      });
      if (!register) throw new NotFoundException("La caja no está disponible.");
      if (
        await tx.cashSession.findFirst({
          where: { cashRegisterId: register.id, closedAt: null },
        })
      )
        throw new ConflictException("Esta caja ya tiene una sesión abierta.");
      const own = await findOwnOpenSession(tx, actorId, organizationId);
      if (own)
        throw new ConflictException(
          `Ya tenés abierta ${own.registerName} en ${own.branchName}. Cerrala antes de abrir otra.`,
        );
      const session = await tx.cashSession.create({
        data: {
          cashRegisterId: register.id,
          openedById: actorId,
          openingAmountMinor: BigInt(openingAmountMinor),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_SESSION",
        entityId: session.id,
        action: "OPENED",
        after: {
          cashRegisterId: register.id,
          openingAmountMinor: session.openingAmountMinor.toString(),
          openingAmountRequested: rules.askOpeningAmount,
        },
      });
      return {
        ...session,
        openingAmountMinor: session.openingAmountMinor.toString(),
        closingAmountMinor: session.closingAmountMinor?.toString() ?? null,
      };
    });
  }
  async close(
    actorId: string,
    organizationId: string,
    branchId: string,
    sessionId: string,
    input: {
      closingAmountMinor: number;
      reason?: string;
      expectedAmountMinor?: number;
    },
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      await lockCashSession(tx, sessionId);
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId, closedAt: null },
      });
      if (
        !session ||
        !(await tx.cashRegister.findFirst({
          where: { id: session.cashRegisterId, branchId },
        }))
      )
        throw new NotFoundException(
          "La sesión ya está cerrada o no está disponible en esta sucursal.",
        );
      const expected = await this.expectedCash(tx, session);
      if (
        !Number.isSafeInteger(input.closingAmountMinor) ||
        input.closingAmountMinor < 0
      )
        throw new BadRequestException("Ingresá un efectivo contado válido.");
      if (
        input.expectedAmountMinor !== undefined &&
        (!Number.isSafeInteger(input.expectedAmountMinor) ||
          BigInt(input.expectedAmountMinor) !== expected)
      )
        throw new ConflictException(
          "El efectivo esperado cambió. Revisá la diferencia y volvé a confirmar el cierre.",
        );
      if (
        BigInt(input.closingAmountMinor) !== expected &&
        (input.reason?.trim().length ?? 0) < 3
      )
        throw new BadRequestException(
          "Indicá un motivo de al menos 3 caracteres para la diferencia.",
        );
      const registerSnapshot = await tx.cashRegister.findFirst({
        where: { id: session.cashRegisterId, branchId },
      });
      const closingMembers = await tx.userOrganization.findMany({
        where: {
          organizationId,
          userId: { in: [actorId, session.openedById] },
        },
        select: { userId: true, displayName: true },
      });
      const closingName = (id: string) =>
        closingMembers.find((member) => member.userId === id)?.displayName ||
        "Usuario sin nombre configurado";
      const closed = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          closedAt: new Date(),
          closingAmountMinor: BigInt(input.closingAmountMinor),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_SESSION",
        entityId: sessionId,
        action: "CLOSED",
        before: { openingAmountMinor: session.openingAmountMinor.toString() },
        after: {
          expectedAmountMinor: expected.toString(),
          cashRegisterName: registerSnapshot?.name ?? "Caja",
          closedByName: closingName(actorId),
          registerResponsibleName: registerSnapshot?.responsibleName ?? null,
          openedByName: closingName(session.openedById),
          closingAmountMinor: input.closingAmountMinor,
          differenceMinor: (
            BigInt(input.closingAmountMinor) - expected
          ).toString(),
          reason: input.reason?.trim() ?? null,
        },
      });
      return {
        ...closed,
        openingAmountMinor: closed.openingAmountMinor.toString(),
        closingAmountMinor: closed.closingAmountMinor?.toString() ?? null,
        expectedAmountMinor: expected.toString(),
        differenceMinor: (
          BigInt(input.closingAmountMinor) - expected
        ).toString(),
      };
    });
  }
  async movement(
    actorId: string,
    organizationId: string,
    branchId: string,
    sessionId: string,
    input: {
      type: CashMovementType;
      amountMinor: number;
      reason: string;
      clientOperationId?: string;
    },
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const rules = await readCashSettings(tx, branchId);
      if (!rules.allowManualMovements)
        throw new ForbiddenException(
          "Los movimientos manuales están deshabilitados en esta sucursal.",
        );
      await lockCashSession(tx, sessionId);
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId, closedAt: null },
      });
      if (
        !session ||
        !(await tx.cashRegister.findFirst({
          where: { id: session.cashRegisterId, branchId },
        }))
      )
        throw new NotFoundException(
          "La sesión ya está cerrada o no está disponible en esta sucursal.",
        );
      if (
        !Number.isSafeInteger(input.amountMinor) ||
        input.amountMinor <= 0 ||
        (rules.requireMovementReason && input.reason.trim().length < 3)
      )
        throw new BadRequestException(
          "Ingresá un importe positivo y un motivo de al menos 3 caracteres.",
        );
      if (input.clientOperationId) {
        const previous = await tx.cashMovement.findUnique({
          where: { id: input.clientOperationId },
        });
        if (previous) {
          if (
            previous.cashSessionId !== sessionId ||
            previous.actorId !== actorId ||
            previous.type !== input.type ||
            previous.amountMinor !== BigInt(input.amountMinor) ||
            previous.reason !== input.reason.trim()
          )
            throw new ConflictException(
              "Esta solicitud ya fue utilizada para otro movimiento.",
            );
          return { ...previous, amountMinor: previous.amountMinor.toString() };
        }
      }
      if (input.type === CashMovementType.OUT) {
        const available = await this.expectedCash(tx, session);
        if (BigInt(input.amountMinor) > available)
          throw new BadRequestException(
            `El egreso supera el efectivo disponible en caja (${formatCashMinor(available)}).`,
          );
      }
      const movement = await tx.cashMovement.create({
        data: {
          id: input.clientOperationId,
          cashSessionId: sessionId,
          type: input.type,
          amountMinor: BigInt(input.amountMinor),
          reason: input.reason.trim(),
          actorId,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_SESSION",
        entityId: sessionId,
        action: input.type === CashMovementType.IN ? "MANUAL_IN" : "MANUAL_OUT",
        after: {
          amountMinor: input.amountMinor,
          reason: input.reason.trim(),
        },
      });
      return { ...movement, amountMinor: movement.amountMinor.toString() };
    });
  }
  /**
   * Apertura, movimiento o cierre hecho sin conexión que la PC manda al volver
   * (SISTEMA-67). Ya ocurrió: se registra con su hora real y lo que haya
   * cambiado mientras tanto queda como aviso "a revisar". Reenviarla devuelve
   * el resultado original.
   */
  async completeOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionCajaSinConexion,
  ) {
    await this.assert(actorId, organizationId, "CASH_MANAGE");
    await this.branch(organizationId, branchId);
    validarOperacionCaja(op);
    const occurredAt = offlineOccurredAt(op.occurredAt, new Date());
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (subscription) {
      const { access, stage } = subscriptionAccessAt(subscription, occurredAt);
      if (access !== "FULL")
        throw subscriptionDenied(
          access === "READ_ONLY" ? "READ_ONLY" : "BLOCKED",
          stage,
        );
    }
    const requestHash = hashOperacionCaja(op);
    return this.prisma.$transaction(async (tx) => {
      const previa = await tx.offlineOperation.findUnique({
        where: { id: op.clientOperationId },
        include: { issues: true },
      });
      if (previa) {
        if (
          previa.organizationId !== organizationId ||
          previa.requestHash !== requestHash
        )
          throw new ConflictException(
            "Esta operación sin conexión ya se registró con otros datos.",
          );
        return { entityId: previa.entityId, offlineIssues: previa.issues };
      }
      const avisos: { kind: string; detail: Prisma.InputJsonValue }[] = [];
      const origen = { origen: "SIN_CONEXION", deviceId: op.deviceId };
      let entityId: string | null = null;
      if (TIPOS_DE_COBRO.includes(op.tipo)) {
        entityId = op.collectionId!;
        await this.cobroSinConexion(tx, {
          actorId,
          organizationId,
          branchId,
          op,
          occurredAt,
          avisos,
          origen: { ...origen, occurredAt: occurredAt.toISOString() },
        });
      } else if (op.tipo === "APERTURA") {
        await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${op.cashRegisterId!}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
        const register = await tx.cashRegister.findFirst({
          where: { id: op.cashRegisterId, branchId, active: true },
        });
        if (!register)
          throw new NotFoundException("La caja no está disponible.");
        const abierta = await tx.cashSession.findFirst({
          where: { cashRegisterId: register.id, closedAt: null },
        });
        if (abierta) {
          // Otra PC la abrió mientras tanto: todo se suma a esa sesión.
          entityId = abierta.id;
          avisos.push({
            kind: "CAJA_YA_ABIERTA",
            detail: { caja: register.name, cashSessionId: abierta.id },
          });
        } else {
          const own = await findOwnOpenSession(tx, actorId, organizationId);
          if (own)
            avisos.push({
              kind: "OTRA_CAJA_ABIERTA",
              detail: { caja: own.registerName, sucursal: own.branchName },
            });
          const rules = await readCashSettings(tx, branchId);
          const session = await tx.cashSession.create({
            data: {
              id: op.clientOperationId,
              cashRegisterId: register.id,
              openedById: actorId,
              openedAt: occurredAt,
              openingAmountMinor: BigInt(
                rules.askOpeningAmount ? op.openingAmountMinor! : 0,
              ),
            },
          });
          entityId = session.id;
          await this.audit.recordInTransaction(tx, {
            organizationId,
            branchId,
            actorId,
            entityType: "CASH_SESSION",
            entityId: session.id,
            action: "OPENED",
            after: {
              cashRegisterId: register.id,
              openingAmountMinor: session.openingAmountMinor.toString(),
              ...origen,
            },
          });
        }
        // Ventas de esta caja que llegaron antes que su apertura quedaron en
        // cobros pendientes: pasan a esta caja con su hora original.
        await this.reubicarCobrosDeApertura(
          tx,
          organizationId,
          branchId,
          op.clientOperationId,
          entityId!,
          actorId,
        );
      } else {
        const sessionId = await sesionReal(tx, organizationId, op.sessionId!);
        await lockCashSession(tx, sessionId);
        const session = await tx.cashSession.findFirst({
          where: { id: sessionId },
        });
        const register = session
          ? await tx.cashRegister.findFirst({
              where: { id: session.cashRegisterId, branchId },
            })
          : null;
        if (!session || !register)
          throw new NotFoundException(
            "La caja de esta operación no está disponible en la sucursal.",
          );
        entityId = session.id;
        if (op.tipo === "MOVIMIENTO") {
          const rules = await readCashSettings(tx, branchId);
          if (!rules.allowManualMovements)
            throw new BadRequestException(
              "Los movimientos manuales están deshabilitados en esta sucursal.",
            );
          const detalle = {
            tipo: op.type!,
            amountMinor: String(op.amountMinor),
            motivo: op.reason?.trim() ?? "",
            caja: register.name,
          };
          if (session.closedAt) {
            // La caja se cerró antes de que llegara: no entra en ese cierre.
            avisos.push({ kind: "MOVIMIENTO_RETENIDO", detail: detalle });
          } else {
            if (op.type === "OUT") {
              const disponible = await this.expectedCash(tx, session);
              if (BigInt(op.amountMinor!) > disponible)
                avisos.push({
                  kind: "EGRESO_SUPERA_EFECTIVO",
                  detail: {
                    ...detalle,
                    disponibleMinor: disponible.toString(),
                  },
                });
            }
            await tx.cashMovement.create({
              data: {
                id: op.clientOperationId,
                cashSessionId: session.id,
                type: op.type!,
                amountMinor: BigInt(op.amountMinor!),
                reason: op.reason?.trim() || "Movimiento sin conexión",
                actorId,
                createdAt: occurredAt,
              },
            });
            await this.audit.recordInTransaction(tx, {
              organizationId,
              branchId,
              actorId,
              entityType: "CASH_SESSION",
              entityId: session.id,
              action: op.type === "IN" ? "MANUAL_IN" : "MANUAL_OUT",
              after: {
                amountMinor: op.amountMinor,
                reason: op.reason?.trim() ?? "",
                ...origen,
              },
            });
          }
        } else if (session.closedAt) {
          // Ya la cerró otra PC: el cierre de esta PC sólo queda como aviso.
          avisos.push({
            kind: "CIERRE_DISTINTO",
            detail: {
              motivo: "La caja ya estaba cerrada.",
              caja: register.name,
              contadoMinor: String(op.closingAmountMinor),
            },
          });
        } else {
          const esperado = await this.expectedCash(tx, session);
          if (esperado !== BigInt(op.expectedAmountMinor!))
            avisos.push({
              kind: "CIERRE_DISTINTO",
              detail: {
                motivo: "El esperado cambió mientras no había conexión.",
                caja: register.name,
                vioMinor: String(op.expectedAmountMinor),
                esperadoMinor: esperado.toString(),
                contadoMinor: String(op.closingAmountMinor),
              },
            });
          const closedAt =
            occurredAt.getTime() < session.openedAt.getTime()
              ? session.openedAt
              : occurredAt;
          await tx.cashSession.update({
            where: { id: session.id },
            data: {
              closedAt,
              closingAmountMinor: BigInt(op.closingAmountMinor!),
            },
          });
          await this.audit.recordInTransaction(tx, {
            organizationId,
            branchId,
            actorId,
            entityType: "CASH_SESSION",
            entityId: session.id,
            action: "CLOSED",
            before: {
              openingAmountMinor: session.openingAmountMinor.toString(),
            },
            after: {
              expectedAmountMinor: esperado.toString(),
              cashRegisterName: register.name,
              closingAmountMinor: op.closingAmountMinor,
              differenceMinor: (
                BigInt(op.closingAmountMinor!) - esperado
              ).toString(),
              reason: op.reason?.trim() || "Cierre sin conexión",
              ...origen,
            },
          });
        }
      }
      await tx.offlineOperation.create({
        data: {
          id: op.clientOperationId,
          organizationId,
          branchId,
          kind: KIND_POR_TIPO[op.tipo],
          actorId,
          deviceId: op.deviceId,
          occurredAt,
          requestHash,
          entityId,
        },
      });
      const offlineIssues = [];
      for (const aviso of avisos)
        offlineIssues.push(
          await tx.offlineSyncIssue.create({
            data: {
              organizationId,
              branchId,
              operationId: op.clientOperationId,
              kind: aviso.kind,
              detail: aviso.detail,
            },
          }),
        );
      return { entityId, offlineIssues };
    });
  }

  /**
   * Cobro pendiente asignado, incorporado o liberado sin conexión
   * (SISTEMA-81). Si al llegar otra PC ya hizo algo con ese cobro (o la venta
   * se anuló), no se toca nada y queda aviso: nunca se mueve plata de más. Si
   * la sesión elegida ya estaba cerrada, el cobro sigue pendiente.
   */
  private async cobroSinConexion(
    tx: Prisma.TransactionClient,
    datos: {
      actorId: string;
      organizationId: string;
      branchId: string;
      op: OperacionCajaSinConexion;
      occurredAt: Date;
      avisos: { kind: string; detail: Prisma.InputJsonValue }[];
      origen: Record<string, string>;
    },
  ) {
    const { actorId, organizationId, branchId, op, occurredAt, avisos } = datos;
    const id = op.collectionId!;
    const original = await tx.cashPendingCollection.findFirst({
      where: { id, organizationId, branchId },
    });
    if (!original)
      throw new NotFoundException("Cobro pendiente no disponible.");
    const aviso = (motivo: string) =>
      avisos.push({
        kind: "COBRO_YA_ASIGNADO",
        detail: {
          motivo,
          origen: original.sourceType === "SALE" ? "Venta" : "Recibo",
          comprobante: original.sourceId.slice(0, 8).toUpperCase(),
          efectivoMinor: original.cashMinor.toString(),
        },
      });
    if (original.sourceType === "SALE") {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${original.sourceId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      if (
        !(await tx.sale.findFirst({
          where: {
            id: original.sourceId,
            organizationId,
            branchId,
            status: "COMPLETED",
          },
        }))
      )
        return aviso("La venta se anuló mientras no había conexión.");
    }
    await tx.$queryRaw`SELECT id FROM "CashPendingCollection" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.cashPendingCollection.findUniqueOrThrow({
      where: { id },
    });
    if (row.voidedAt) return aviso("El cobro se anuló.");
    if (op.tipo === "COBRO_INCORPORAR") {
      const sessionId = await sesionReal(tx, organizationId, op.sessionId!);
      if (row.assignedAt) {
        if (row.assignedSessionId !== sessionId)
          aviso("Otra PC ya lo había incorporado a otra sesión.");
        return;
      }
      await lockCashSession(tx, sessionId);
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId },
      });
      const register = session
        ? await tx.cashRegister.findFirst({
            where: { id: session.cashRegisterId, branchId },
          })
        : null;
      if (!session || !register)
        throw new NotFoundException(
          "La caja de esta operación no está disponible en la sucursal.",
        );
      if (session.closedAt) {
        avisos.push({
          kind: "CAJA_CERRADA",
          detail: {
            caja: register.name,
            motivo:
              "La sesión ya estaba cerrada: el cobro sigue pendiente. Incorporalo a una sesión abierta.",
          },
        });
        return;
      }
      if (
        row.destinationRegisterId &&
        row.destinationRegisterId !== session.cashRegisterId
      )
        return aviso("Otra PC le había asignado otra caja: no se incorporó.");
      await this.incorporarCobro(tx, {
        actorId,
        organizationId,
        branchId,
        row,
        sessionId,
        assignedAt:
          occurredAt.getTime() < session.openedAt.getTime()
            ? session.openedAt
            : occurredAt,
        origen: datos.origen,
      });
      return;
    }
    if (row.assignedAt)
      return aviso("Otra PC ya lo había incorporado a una sesión.");
    if (op.tipo === "COBRO_DESTINO") {
      if (row.destinationRegisterId) {
        if (row.destinationRegisterId !== op.cashRegisterId)
          aviso("Otra PC ya le había asignado otra caja.");
        return;
      }
      if (
        !(await tx.cashRegister.findFirst({
          where: { id: op.cashRegisterId, branchId, active: true },
        }))
      )
        throw new NotFoundException("La caja no está disponible.");
      await tx.cashPendingCollection.update({
        where: { id },
        data: {
          destinationRegisterId: op.cashRegisterId,
          destinationSetAt: occurredAt,
          destinationSetById: actorId,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CASH_PENDING_COLLECTION",
        entityId: id,
        action: "DESTINATION_ASSIGNED",
        after: {
          cashRegisterId: op.cashRegisterId,
          sourceId: row.sourceId,
          collectedAt: row.collectedAt.toISOString(),
          ...datos.origen,
        },
      });
      return;
    }
    // Quitar la caja: sólo si sigue siendo la que vio la PC.
    if (!row.destinationRegisterId) return;
    if (row.destinationRegisterId !== op.expectedRegisterId)
      return aviso("Otra PC le cambió la caja: no se quitó.");
    await tx.cashPendingCollection.update({
      where: { id },
      data: {
        destinationRegisterId: null,
        destinationSetAt: null,
        destinationSetById: null,
      },
    });
    await this.audit.recordInTransaction(tx, {
      organizationId,
      branchId,
      actorId,
      entityType: "CASH_PENDING_COLLECTION",
      entityId: id,
      action: "DESTINATION_CLEARED",
      before: {
        cashRegisterId: row.destinationRegisterId,
        sourceId: row.sourceId,
        collectedAt: row.collectedAt.toISOString(),
      },
      after: datos.origen,
    });
  }

  /**
   * Operación de caja sin conexión de otro usuario de la misma PC: la manda
   * quien esté conectado y queda a nombre de quien la hizo, si su firma de esa
   * PC coincide con el texto exacto (SISTEMA-67, como las ventas).
   */
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
    op: OperacionCajaSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.completeOffline(senderId, organizationId, branchId, op);
    // Quien la manda sólo la reenvía: alcanza con que sea de la farmacia (la
    // sucursal ya la validó el guard). Lo que cuenta es la firma y el permiso
    // de quien la hizo.
    if (
      !(await this.prisma.userOrganization.findFirst({
        where: { userId: senderId, organizationId, active: true },
      }))
    )
      throw new ForbiddenException("No pertenecés a esta farmacia.");
    const clave = await this.prisma.offlineDeviceKey.findUnique({
      where: {
        userId_deviceId: { userId: firma.actorId, deviceId: firma.deviceId },
      },
    });
    if (!clave) throw sinClaveRegistrada("la operación");
    if (!firmaValida(clave.publicKey, firma.payload, firma.signature))
      throw new BadRequestException(
        "La firma de la operación de caja no es válida: no se registra a nombre de otro usuario.",
      );
    try {
      await this.assert(firma.actorId, organizationId, "CASH_MANAGE");
    } catch {
      throw new BadRequestException(
        "Quien hizo la operación ya no puede manejar la caja. Revisala a mano.",
      );
    }
    if (
      !(await this.prisma.userBranch.findFirst({
        where: {
          userId: firma.actorId,
          branchId,
          branch: { organizationId, active: true },
        },
      }))
    )
      throw new BadRequestException(
        "Quien hizo la operación ya no tiene acceso a esta sucursal. Revisala a mano.",
      );
    const resultado = await this.completeOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
    );
    if (
      !(await this.prisma.auditLog.findFirst({
        where: {
          organizationId,
          entityId: op.clientOperationId,
          action: "SINCRONIZADA_POR_OTRO",
        },
      }))
    )
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          branchId,
          actorId: senderId,
          entityType: "OFFLINE_OPERATION",
          entityId: op.clientOperationId,
          action: "SINCRONIZADA_POR_OTRO",
          after: {
            hizoId: firma.actorId,
            deviceId: firma.deviceId,
            tipo: op.tipo,
          },
        },
      });
    return resultado;
  }

  /** Quién hizo cada venta (auditoría de la venta), para la lista de caja. */
  private async sellerLabels(organizationId: string, saleIds: string[]) {
    if (!saleIds.length) return new Map<string, string>();
    const completadas = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType: "SALE",
        action: "COMPLETED",
        entityId: { in: [...new Set(saleIds)] },
      },
      select: { entityId: true, actorId: true },
    });
    const names = await this.memberLabels(
      organizationId,
      completadas.flatMap((row) => (row.actorId ? [row.actorId] : [])),
    );
    const vendedores = new Map<string, string>();
    for (const row of completadas)
      if (row.entityId && row.actorId) {
        const nombre = names.get(row.actorId);
        if (nombre) vendedores.set(row.entityId, nombre);
      }
    return vendedores;
  }
  private async withSellers<T extends { saleId: string; amountMinor: bigint }>(
    organizationId: string,
    payments: T[],
  ) {
    const vendedores = await this.sellerLabels(
      organizationId,
      payments.map((payment) => payment.saleId),
    );
    return payments.map((payment) => ({
      ...payment,
      amountMinor: payment.amountMinor.toString(),
      actorName: vendedores.get(payment.saleId) ?? null,
    }));
  }

  /** Nombre visible de cada usuario: sin nombre cargado, se identifica por su email. */
  private async memberLabels(organizationId: string, userIds: string[]) {
    const members = await this.prisma.userOrganization.findMany({
      where: { organizationId, userId: { in: [...new Set(userIds)] } },
      select: {
        userId: true,
        displayName: true,
        user: { select: { email: true } },
      },
    });
    return new Map(
      members.map((member) => [
        member.userId,
        member.displayName || member.user.email,
      ]),
    );
  }
  private async branch(organizationId: string, branchId: string) {
    if (
      !(await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId },
      }))
    )
      throw new NotFoundException("La sucursal no está disponible.");
  }
  private responsibleName(value?: string | null) {
    const name = value?.trim() || null;
    if (name && (name.length < 2 || name.length > 100))
      throw new BadRequestException(
        "El responsable debe tener entre 2 y 100 caracteres.",
      );
    return name;
  }
  private dateRange(from?: string, to?: string) {
    const start = from
      ? new Date(`${from}T00:00:00.000-03:00`)
      : new Date(Date.now() - 29 * 86400000);
    const end = to ? new Date(`${to}T23:59:59.999-03:00`) : new Date();
    if (
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      start > end
    )
      throw new ConflictException("Revisá el rango de fechas de los cierres.");
    return { start, end };
  }
  private async summarizeSessions(
    sessions: Array<{
      id: string;
      cashRegisterId: string;
      openedAt: Date;
      closedAt: Date | null;
      openingAmountMinor: bigint;
      closingAmountMinor: bigint | null;
      movements: Array<{
        id: string;
        type: CashMovementType;
        amountMinor: bigint;
        reason: string;
        createdAt: Date;
      }>;
    }>,
  ) {
    const sessionIds = sessions.map((session) => session.id);
    const [payments, incorporated, receipts] = sessionIds.length
      ? await Promise.all([
          this.prisma.salePayment.groupBy({
            by: ["cashSessionId", "method"],
            where: {
              cashSessionId: { in: sessionIds },
              method: { in: ["CASH", "CARD", "TRANSFER"] },
              sale: { status: "COMPLETED" },
            },
            _sum: { amountMinor: true },
          }),
          this.prisma.cashPendingCollection.groupBy({
            by: ["assignedSessionId"],
            where: { assignedSessionId: { in: sessionIds }, voidedAt: null },
            _sum: { cardMinor: true, transferMinor: true },
          }),
          this.prisma.customerAccountMovement.findMany({
            where: { cashSessionId: { in: sessionIds }, type: "CREDIT" },
            select: {
              cashSessionId: true,
              paymentMethod: true,
              amountMinor: true,
              allocations: true,
            },
          }),
        ])
      : [[], [], []];
    const cashBySession = new Map(
      payments
        .filter((payment) => payment.method === "CASH")
        .map((payment) => [
          payment.cashSessionId,
          payment._sum.amountMinor ?? 0n,
        ]),
    );
    // Tarjeta y transferencia se informan aparte: nunca entran al efectivo.
    const collected = new Map<string, { card: bigint; transfer: bigint }>();
    const collect = (
      sessionId: string | null,
      method: string | null,
      amount: bigint,
    ) => {
      if (!sessionId || (method !== "CARD" && method !== "TRANSFER")) return;
      const total = collected.get(sessionId) ?? { card: 0n, transfer: 0n };
      if (method === "CARD") total.card += amount;
      else total.transfer += amount;
      collected.set(sessionId, total);
    };
    for (const payment of payments)
      collect(
        payment.cashSessionId,
        payment.method,
        payment._sum.amountMinor ?? 0n,
      );
    for (const row of incorporated) {
      collect(row.assignedSessionId, "CARD", row._sum.cardMinor ?? 0n);
      collect(row.assignedSessionId, "TRANSFER", row._sum.transferMinor ?? 0n);
    }
    for (const receipt of receipts) {
      const parts = readReceiptPayments(receipt.allocations);
      if (parts)
        for (const part of parts)
          collect(receipt.cashSessionId, part.method, BigInt(part.amountMinor));
      else
        collect(
          receipt.cashSessionId,
          receipt.paymentMethod,
          receipt.amountMinor,
        );
    }
    return sessions.map((session) => {
      const manualInMinor = session.movements.reduce(
        (sum, movement) =>
          sum +
          (movement.type === CashMovementType.IN ? movement.amountMinor : 0n),
        0n,
      );
      const manualOutMinor = session.movements.reduce(
        (sum, movement) =>
          sum +
          (movement.type === CashMovementType.OUT ? movement.amountMinor : 0n),
        0n,
      );
      const cashSalesMinor = cashBySession.get(session.id) ?? 0n;
      const expectedAmountMinor =
        session.openingAmountMinor +
        cashSalesMinor +
        manualInMinor -
        manualOutMinor;
      return {
        ...session,
        openingAmountMinor: session.openingAmountMinor.toString(),
        closingAmountMinor: session.closingAmountMinor?.toString() ?? null,
        cashSalesMinor: cashSalesMinor.toString(),
        saleChangeMinor: saleChangeMinor(session.movements).toString(),
        cardMinor: (collected.get(session.id)?.card ?? 0n).toString(),
        transferMinor: (collected.get(session.id)?.transfer ?? 0n).toString(),
        manualInMinor: manualInMinor.toString(),
        manualOutMinor: manualOutMinor.toString(),
        expectedAmountMinor: expectedAmountMinor.toString(),
        differenceMinor:
          session.closingAmountMinor === null
            ? null
            : (session.closingAmountMinor - expectedAmountMinor).toString(),
        movements: session.movements.map((movement) => ({
          ...movement,
          amountMinor: movement.amountMinor.toString(),
          category: cashMovementCategory(movement.reason),
        })),
      };
    });
  }
  /** Efectivo que debería haber en la sesión. Llamar con la sesión bloqueada. */
  /**
   * Si una venta sin conexión llegó antes que la apertura de su caja, quedó en
   * cobros pendientes con aviso CAJA_CERRADA. Al llegar la apertura se pasa a
   * esa caja como venta (no como cobro incorporado) y el aviso se resuelve.
   */
  private async reubicarCobrosDeApertura(
    tx: Prisma.TransactionClient,
    organizationId: string,
    branchId: string,
    aperturaId: string,
    sessionId: string,
    actorId: string,
  ) {
    const avisos = await tx.offlineSyncIssue.findMany({
      where: {
        organizationId,
        branchId,
        kind: "CAJA_CERRADA",
        status: "OPEN",
        saleId: { not: null },
      },
    });
    const ahora = new Date();
    for (const aviso of avisos) {
      const detalle = aviso.detail as { cashSessionId?: string } | null;
      if (detalle?.cashSessionId !== aperturaId || !aviso.saleId) continue;
      const pendiente = await tx.cashPendingCollection.findUnique({
        where: {
          organizationId_sourceType_sourceId: {
            organizationId,
            sourceType: "SALE",
            sourceId: aviso.saleId,
          },
        },
      });
      // Ya la incorporó alguien a mano o se anuló: no se toca.
      if (!pendiente || pendiente.assignedAt || pendiente.voidedAt) continue;
      await tx.salePayment.updateMany({
        where: {
          saleId: aviso.saleId,
          method: { not: "ACCOUNT" },
          cashSessionId: null,
        },
        data: { cashSessionId: sessionId },
      });
      if (pendiente.changeMinor > 0n)
        await tx.cashMovement.create({
          data: {
            cashSessionId: sessionId,
            type: CashMovementType.OUT,
            amountMinor: pendiente.changeMinor,
            reason: `Vuelto de venta ${aviso.saleId}`,
            actorId: pendiente.actorId,
            createdAt: pendiente.collectedAt,
          },
        });
      await tx.cashPendingCollection.update({
        where: { id: pendiente.id },
        data: {
          assignedSessionId: sessionId,
          assignedAt: ahora,
          assignedById: actorId,
        },
      });
      await tx.offlineSyncIssue.update({
        where: { id: aviso.id },
        data: {
          status: "RESOLVED",
          resolvedAt: ahora,
          resolvedById: actorId,
          resolutionNote:
            "Llegó la apertura de su caja: la venta quedó en esa caja.",
        },
      });
    }
  }
  private async expectedCash(
    tx: Prisma.TransactionClient,
    session: { id: string; openingAmountMinor: bigint },
  ) {
    const cash = await tx.salePayment.aggregate({
      where: {
        cashSessionId: session.id,
        method: "CASH",
        sale: { status: "COMPLETED" },
      },
      _sum: { amountMinor: true },
    });
    const movements = await tx.cashMovement.groupBy({
      by: ["type"],
      where: { cashSessionId: session.id },
      _sum: { amountMinor: true },
    });
    const movementTotal = movements.reduce(
      (sum, movement) =>
        sum +
        (movement.type === CashMovementType.IN ? 1n : -1n) *
          (movement._sum.amountMinor ?? 0n),
      0n,
    );
    return (
      session.openingAmountMinor + (cash._sum.amountMinor ?? 0n) + movementTotal
    );
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
      throw new ForbiddenException(
        "No tenés permiso para esta acción de caja.",
      );
  }
}
