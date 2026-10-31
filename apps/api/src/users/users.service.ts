import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { hash } from "@node-rs/argon2";

import { PrismaService } from "../prisma/prisma.service";

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
      throw new ForbiddenException("You do not have permission to read users.");
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
        throw new ForbiddenException("User is outside the organization.");
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

  async update(
    actorId: string,
    organizationId: string,
    userId: string,
    active: boolean,
    branchIds: string[],
    roleIds: string[],
  ) {
    await this.assertPermission(actorId, organizationId, "USER_MANAGE");
    if (actorId === userId)
      throw new ForbiddenException("You cannot modify your own access.");
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { roles: { include: { role: true } } },
    });
    if (!membership)
      throw new ForbiddenException("User is outside the organization.");
    const [branches, roles] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where: { id: { in: branchIds }, organizationId, active: true },
      }),
      this.prisma.role.findMany({
        where: { id: { in: roleIds }, organizationId },
      }),
    ]);
    if (branches.length !== branchIds.length || roles.length !== roleIds.length)
      throw new ForbiddenException(
        "Branch or role is outside the organization.",
      );
    const wasOwner = membership.roles.some(({ role }) => role.code === "OWNER");
    const retainsOwner = active && roles.some((role) => role.code === "OWNER");
    if (wasOwner && !retainsOwner) {
      const owners = await this.prisma.userOrganization.count({
        where: {
          organizationId,
          active: true,
          roles: { some: { role: { code: "OWNER" } } },
        },
      });
      if (owners <= 1)
        throw new ForbiddenException(
          "An organization must keep at least one active owner.",
        );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userOrganization.update({
        where: { id: membership.id },
        data: { active },
      });
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
    if (existing) throw new ConflictException("Email is already in use.");
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, organizationId, active: true },
    });
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId },
    });
    if (branches.length !== branchIds.length || roles.length !== roleIds.length)
      throw new ForbiddenException(
        "Branch or role is outside the organization.",
      );
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: normalizedEmail, passwordHash: await hash(password) },
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
      throw new ForbiddenException("You do not have the required permission.");
  }
}
