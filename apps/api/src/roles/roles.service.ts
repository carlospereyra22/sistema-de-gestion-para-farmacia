import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "ROLE_READ");
    return this.prisma.role.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { name: "asc" },
    });
  }

  async create(
    actorId: string,
    organizationId: string,
    name: string,
    code: string,
    permissionCodes: string[],
  ) {
    await this.assertPermission(actorId, organizationId, "ROLE_MANAGE");
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    if (permissions.length !== permissionCodes.length)
      throw new ForbiddenException("One or more permissions are invalid.");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { organizationId, name: name.trim(), code },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
        return role;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new ConflictException("Role code is already in use.");
      throw error;
    }
  }

  /** El rol OWNER no se edita: una farmacia nunca debe quedarse sin quien la administre. */
  async updatePermissions(
    actorId: string,
    organizationId: string,
    roleId: string,
    permissionCodes: string[],
  ) {
    await this.assertPermission(actorId, organizationId, "ROLE_MANAGE");
    const codes = [...new Set(permissionCodes)];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    if (permissions.length !== codes.length)
      throw new BadRequestException("Revisá los permisos elegidos.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Role" WHERE id=${roleId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const role = await tx.role.findFirst({
        where: { id: roleId, organizationId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundException("Rol no encontrado.");
      if (role.code === "OWNER")
        throw new ForbiddenException(
          "El rol de dueño siempre conserva todos los permisos.",
        );
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ROLE",
          entityId: roleId,
          action: "ROLE_PERMISSIONS_UPDATED",
          before: {
            permissions: role.permissions
              .map(({ permission }) => permission.code)
              .sort(),
          },
          after: { permissions: [...codes].sort() },
        },
      });
      return { id: roleId, permissionCodes: codes };
    });
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
