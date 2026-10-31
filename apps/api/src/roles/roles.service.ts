import {
  ConflictException,
  ForbiddenException,
  Injectable,
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
