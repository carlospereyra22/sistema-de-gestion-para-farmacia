import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { assertQuotaAvailable } from "../platform/subscription-quota";

const SOLO_DUENO =
  "Sólo un dueño puede dar o quitar el rol de dueño, o cambiar el acceso de otro dueño.";

/** ¿El usuario es dueño activo de la farmacia? */
async function esDueno(
  db: Pick<Prisma.TransactionClient, "userOrganization">,
  userId: string,
  organizationId: string,
) {
  return (
    (await db.userOrganization.count({
      where: {
        userId,
        organizationId,
        active: true,
        roles: { some: { role: { code: "OWNER" } } },
      },
    })) > 0
  );
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, organizationId: string) {
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
    const allowed =
      membership?.active &&
      membership.roles.some(({ role }) =>
        role.permissions.some(
          ({ permission }) => permission.code === "USER_READ",
        ),
      );
    if (!allowed)
      throw new ForbiddenException(
        "No tenés permiso para ver los usuarios. Pedíselo al dueño de la farmacia.",
      );
    const memberships = await this.prisma.userOrganization.findMany({
      where: { organizationId },
      select: {
        displayName: true,
        active: true,
        user: {
          select: {
            id: true,
            email: true,
            active: true,
            branches: {
              where: { branch: { organizationId } },
              select: { branch: { select: { id: true, name: true } } },
            },
          },
        },
        roles: {
          select: { role: { select: { id: true, code: true, name: true } } },
        },
        userId: true,
      },
    });
    return memberships.map(({ user, ...membership }) => ({
      ...membership,
      isCurrentUser: user.id === actorId,
      user: { id: user.id, email: user.email, active: user.active },
      branches: user.branches,
    }));
  }

  async setDisplayName(
    actorId: string,
    organizationId: string,
    userId: string,
    displayName: string,
  ) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (!membership)
        throw new ForbiddenException("El usuario no es de esta farmacia.");
      const name = displayName.trim() || null;
      await tx.userOrganization.update({
        where: { id: membership.id },
        data: { displayName: name },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "USER",
          entityId: userId,
          action: "DISPLAY_NAME_UPDATED",
          after: { displayName: name },
        },
      });
      return { displayName: name };
    });
  }

  /**
   * Edita nombre, estado, roles y sucursales de un usuario de la farmacia en una
   * sola transacción, con auditoría. Cada uno puede cambiarse el nombre, pero no
   * sus propios roles, sucursales ni estado. La farmacia nunca se queda sin dueño.
   */
  async update(
    actorId: string,
    organizationId: string,
    userId: string,
    input: {
      active: boolean;
      branchIds: string[];
      roleIds: string[];
      displayName?: string;
    },
  ) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    const branchIds = [...new Set(input.branchIds)];
    const roleIds = [...new Set(input.roleIds)];
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        include: {
          roles: { include: { role: true } },
          user: {
            select: {
              branches: {
                where: { branch: { organizationId } },
                select: { branchId: true },
              },
            },
          },
        },
      });
      if (!membership)
        throw new NotFoundException("El usuario no pertenece a la farmacia.");
      await tx.$queryRaw`SELECT id FROM "UserOrganization" WHERE id=${membership.id}::uuid FOR UPDATE`;
      const [branches, roles] = await Promise.all([
        tx.branch.findMany({
          where: { id: { in: branchIds }, organizationId, active: true },
        }),
        tx.role.findMany({ where: { id: { in: roleIds }, organizationId } }),
      ]);
      if (branches.length !== branchIds.length)
        throw new BadRequestException("Revisá las sucursales elegidas.");
      if (roles.length !== roleIds.length)
        throw new BadRequestException("Revisá los roles elegidos.");
      const before = {
        displayName: membership.displayName,
        active: membership.active,
        roleIds: membership.roles.map(({ roleId }) => roleId).sort(),
        branchIds: membership.user.branches
          .map(({ branchId }) => branchId)
          .sort(),
      };
      const displayName =
        input.displayName === undefined
          ? membership.displayName
          : input.displayName.trim() || null;
      const after = {
        displayName,
        active: input.active,
        roleIds: [...roleIds].sort(),
        branchIds: [...branchIds].sort(),
      };
      const accessChanged =
        before.active !== after.active ||
        before.roleIds.join() !== after.roleIds.join() ||
        before.branchIds.join() !== after.branchIds.join();
      if (actorId === userId && accessChanged)
        throw new ForbiddenException(
          "No podés cambiar tus propios roles, sucursales ni estado. Pedíselo a otro administrador.",
        );
      const wasOwner = membership.roles.some(
        ({ role }) => role.code === "OWNER",
      );
      const getsOwner = roles.some((role) => role.code === "OWNER");
      // Igual que la contraseña de un dueño: un administrador que no es dueño
      // no puede crear dueños ni sacarle el acceso a uno (si no, podría dar
      // el rol a otra cuenta suya y desplazar al dueño real).
      if (
        ((wasOwner && accessChanged) || (getsOwner && !wasOwner)) &&
        !(await esDueno(tx, actorId, organizationId))
      )
        throw new ForbiddenException(SOLO_DUENO);
      const retainsOwner = input.active && getsOwner;
      if (wasOwner && membership.active && !retainsOwner) {
        const owners = await tx.userOrganization.count({
          where: {
            organizationId,
            active: true,
            roles: { some: { role: { code: "OWNER" } } },
          },
        });
        if (owners <= 1)
          throw new ForbiddenException(
            "La farmacia tiene que conservar al menos un dueño activo.",
          );
      }
      if (input.active && !membership.active)
        await assertQuotaAvailable(tx, organizationId, "users");
      await tx.userOrganization.update({
        where: { id: membership.id },
        data: { active: input.active, displayName },
      });
      if (accessChanged) {
        await tx.userBranch.deleteMany({
          where: { userId, branch: { organizationId } },
        });
        await tx.userBranch.createMany({
          data: branchIds.map((branchId) => ({ userId, branchId })),
        });
        await tx.userOrganizationRole.deleteMany({
          where: { membershipId: membership.id },
        });
        await tx.userOrganizationRole.createMany({
          data: roleIds.map((roleId) => ({
            membershipId: membership.id,
            roleId,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "USER",
          entityId: userId,
          action: "USER_UPDATED",
          before,
          after,
        },
      });
      return { id: userId, ...after };
    });
  }

  async create(
    actorId: string,
    organizationId: string,
    email: string,
    password: string,
    branchIds: string[],
    roleIds: string[],
    displayName?: string,
  ) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw new ConflictException("Ese email ya está en uso.");
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, organizationId, active: true },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId },
    });
    if (branches.length !== branchIds.length || roles.length !== roleIds.length)
      throw new ForbiddenException(
        "Revisá las sucursales y los roles: alguno no es de esta farmacia.",
      );
    if (
      roles.some((role) => role.code === "OWNER") &&
      !(await esDueno(this.prisma, actorId, organizationId))
    )
      throw new ForbiddenException(SOLO_DUENO);
    const passwordHash = await hash(password);
    return this.prisma.$transaction(async (tx) => {
      await assertQuotaAvailable(tx, organizationId, "users");
      const user = await tx.user.create({
        data: { email: normalizedEmail, passwordHash },
      });
      const membership = await tx.userOrganization.create({
        data: {
          userId: user.id,
          organizationId,
          displayName: displayName?.trim() || null,
        },
      });
      await tx.userBranch.createMany({
        data: branchIds.map((branchId) => ({ userId: user.id, branchId })),
      });
      await tx.userOrganizationRole.createMany({
        data: roleIds.map((roleId) => ({
          membershipId: membership.id,
          roleId,
        })),
      });
      return { id: user.id, email: user.email };
    });
  }

  /**
   * Restablece la contrasena de otro usuario de la organizacion y cierra sus
   * sesiones. El usuario es global: solo se permite si pertenece unicamente a esta
   * organizacion, para no afectar su acceso a otra. La de un dueno solo la cambia
   * otro dueno. La auditoria no guarda la contrasena.
   */
  async resetPassword(
    actorId: string,
    organizationId: string,
    userId: string,
    password: string,
  ) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    if (actorId === userId)
      throw new ForbiddenException(
        "No podés restablecer tu propia contraseña desde Usuarios.",
      );
    const passwordHash = await hash(password);
    return this.prisma.$transaction(async (tx) => {
      const [target, actor] = await Promise.all(
        [userId, actorId].map((id) =>
          tx.userOrganization.findUnique({
            where: { userId_organizationId: { userId: id, organizationId } },
            include: { roles: { include: { role: true } } },
          }),
        ),
      );
      if (!target)
        throw new ForbiddenException("El usuario no pertenece a la farmacia.");
      const isOwner = (
        membership: { roles: { role: { code: string } }[] } | null | undefined,
      ) => membership?.roles.some(({ role }) => role.code === "OWNER") ?? false;
      if (isOwner(target) && !isOwner(actor))
        throw new ForbiddenException(
          "La contraseña de un dueño solo la puede restablecer otro dueño.",
        );
      if ((await tx.userOrganization.count({ where: { userId } })) > 1)
        throw new ForbiddenException(
          "Este usuario también ingresa a otra farmacia. Pedí el cambio a soporte.",
        );
      const now = new Date();
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "USER",
          entityId: userId,
          action: "PASSWORD_RESET_BY_ADMIN",
          after: { revokedSessions: revoked.count },
        },
      });
      return { revokedSessions: revoked.count };
    });
  }

  async getCreateOptions(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    const [branches, roles] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.role.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { branches, roles };
  }

  private async assertPermission(
    actorId: string,
    organizationId: string,
    permissionCode: string,
  ): Promise<void> {
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
    const allowed =
      membership?.active &&
      membership.roles.some(({ role }) =>
        role.permissions.some(
          ({ permission }) => permission.code === permissionCode,
        ),
      );
    if (!allowed)
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
