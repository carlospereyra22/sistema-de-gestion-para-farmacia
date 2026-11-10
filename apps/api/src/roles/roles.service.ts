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
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { code: true } } } },
        _count: {
          select: { userRoles: { where: { membership: { active: true } } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return roles.map(({ _count, ...role }) => ({
      ...role,
      userCount: _count.userRoles,
    }));
  }

  async create(
    actorId: string,
    organizationId: string,
    name: string,
    code: string,
    permissionCodes: string[],
    description?: string,
  ) {
    await this.assertPermission(actorId, organizationId, "ROLE_MANAGE");
    const permissions = await this.findPermissions(permissionCodes);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            organizationId,
            name: roleName(name),
            code,
            description: roleDescription(description),
          },
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
        throw new ConflictException(
          "Ya existe un rol con ese código. Elegí otro.",
        );
      throw error;
    }
  }

  /** Compatibilidad: clientes viejos solo mandan los permisos. */
  async updatePermissions(
    actorId: string,
    organizationId: string,
    roleId: string,
    permissionCodes: string[],
  ) {
    const role = await this.update(actorId, organizationId, roleId, {
      permissionCodes,
    });
    return { id: role.id, permissionCodes: role.permissionCodes };
  }

  /**
   * Edita nombre, descripción y permisos en una sola transacción. El código no
   * cambia nunca: OWNER y ADMIN tienen reglas atadas a él. El rol OWNER no se
   * edita: una farmacia nunca debe quedarse sin quien la administre.
   */
  async update(
    actorId: string,
    organizationId: string,
    roleId: string,
    input: { name?: string; description?: string; permissionCodes?: string[] },
  ) {
    await this.assertPermission(actorId, organizationId, "ROLE_MANAGE");
    const codes = input.permissionCodes && [...new Set(input.permissionCodes)];
    const permissions = codes && (await this.findPermissions(codes));
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
      const previousCodes = role.permissions
        .map(({ permission }) => permission.code)
        .sort();
      const name = input.name === undefined ? role.name : roleName(input.name);
      const description =
        input.description === undefined
          ? role.description
          : roleDescription(input.description);
      await tx.role.update({
        where: { id: roleId },
        data: { name, description },
      });
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId,
            permissionId: permission.id,
          })),
        });
      }
      const nextCodes = codes ? [...codes].sort() : previousCodes;
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ROLE",
          entityId: roleId,
          action: codes ? "ROLE_PERMISSIONS_UPDATED" : "ROLE_UPDATED",
          before: {
            name: role.name,
            description: role.description,
            permissions: previousCodes,
          },
          after: { name, description, permissions: nextCodes },
        },
      });
      return { id: roleId, name, description, permissionCodes: nextCodes };
    });
  }

  private async findPermissions(codes: readonly string[]) {
    const unique = [...new Set(codes)];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
    });
    if (permissions.length !== unique.length)
      throw new BadRequestException("Revisá los permisos elegidos.");
    return permissions;
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

function roleName(value: string): string {
  const name = value.trim();
  if (name.length < 2)
    throw new BadRequestException(
      "El nombre del rol necesita al menos 2 letras.",
    );
  return name;
}

function roleDescription(value: string | undefined): string | null {
  const description = value?.trim() ?? "";
  return description ? description : null;
}
