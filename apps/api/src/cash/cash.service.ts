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
import { randomUUID } from "node:crypto";
import {
  readCashSettings,
  defaultCashSettings,
  cashSettingsView,
} from "./cash-settings";

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
      canArchive: membership.roles.some(({ role }) => role.code === "ADMIN"),
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
    return rows.map((row) => ({
      ...row,
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
      // Source payments remain untouched. Cash is incorporated exactly once as an allocation entry.
      if (row.cashMinor > 0n)
        await tx.cashMovement.create({
          data: {
            cashSessionId: sessionId,
            type: "IN",
            amountMinor: row.cashMinor,
            actorId,
            reason: `Asignación de cobro sin caja · ${row.sourceType === "SALE" ? "Venta" : "Recibo"} ${row.sourceId} · ${row.collectedAt.toISOString()}`,
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
        },
      });
      return { id, assignedSessionId: sessionId, assignedAt };
    });
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
    const members = await this.prisma.userOrganization.findMany({
      where: {
        organizationId,
        userId: {
          in: [
            ...new Set(
              sessions.flatMap((session) => [
                session.openedById,
                ...session.movements.map((movement) => movement.actorId),
              ]),
            ),
          ],
        },
      },
      select: { userId: true, displayName: true },
    });
    const memberNames = new Map(
      members.map((member) => [member.userId, member.displayName]),
    );
    return {
      registers,
      settings: await readCashSettings(this.prisma, branchId),
      sessions: (await this.summarizeSessions(sessions)).map((session) => ({
        ...session,
        openedBy:
          memberNames.get(
            sessions.find((row) => row.id === session.id)!.openedById,
          ) ?? null,
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
      cashPayments: payments.map((payment) => ({
        ...payment,
        amountMinor: payment.amountMinor.toString(),
      })),
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
      if (!register)
        throw new NotFoundException("Cash register is unavailable.");
      if (
        await tx.cashSession.findFirst({
          where: { cashRegisterId: register.id, closedAt: null },
        })
      )
        throw new ConflictException(
          "Cash register already has an open session.",
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
      const cash = await tx.salePayment.aggregate({
        where: {
          cashSessionId: sessionId,
          method: "CASH",
          sale: { status: "COMPLETED" },
        },
        _sum: { amountMinor: true },
      });
      const movements = await tx.cashMovement.groupBy({
        by: ["type"],
        where: { cashSessionId: sessionId },
        _sum: { amountMinor: true },
      });
      const movementTotal = movements.reduce(
        (sum, movement) =>
          sum +
          (movement.type === CashMovementType.IN ? 1n : -1n) *
            (movement._sum.amountMinor ?? 0n),
        0n,
      );
      const expected =
        session.openingAmountMinor +
        (cash._sum.amountMinor ?? 0n) +
        movementTotal;
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
          "El efectivo esperado cambió. Actualizá la caja y volvé a contar antes de cerrar.",
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
  private async branch(organizationId: string, branchId: string) {
    if (
      !(await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId },
      }))
    )
      throw new NotFoundException("Branch is unavailable.");
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
      throw new ConflictException("The cash closure date range is invalid.");
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
    const payments = sessionIds.length
      ? await this.prisma.salePayment.groupBy({
          by: ["cashSessionId"],
          where: {
            cashSessionId: { in: sessionIds },
            method: "CASH",
            sale: { status: "COMPLETED" },
          },
          _sum: { amountMinor: true },
        })
      : [];
    const cashBySession = new Map(
      payments.map((payment) => [
        payment.cashSessionId,
        payment._sum.amountMinor ?? 0n,
      ]),
    );
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
        })),
      };
    });
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
