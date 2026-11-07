import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BranchDto } from "./branch.dto";
import { fiscalReadiness } from "./fiscal-readiness";
import type { FiscalPointDto } from "./fiscal-point.dto";

import { PrismaService } from "../prisma/prisma.service";
import { readTicketHeader, type TicketHeaderDto } from "./ticket-header";
import {
  readDocumentTemplate,
  readPrintFormat,
  type DocumentTemplateDto,
  type PrintFormat,
} from "./document-template";
import { decodeProductImage } from "../catalog/product-image";
import {
  readFiscalProfile,
  validateFiscalDraft,
  type FiscalProfileDto,
} from "./fiscal-profile";
import { assertQuotaAvailable } from "../platform/subscription-quota";
import { generateBranchCode } from "./branch-code";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async authorizeFiscalManagement(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
  }
  async authorizeFiscalSale(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "SALE_MANAGE");
  }

  async fiscalSetup(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_READ");
    const [organization, points, branches] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      }),
      this.prisma.fiscalPoint.findMany({
        where: { organizationId },
        orderBy: { number: "asc" },
      }),
      this.prisma.branch.findMany({
        where: { organizationId, active: true, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const active = points.filter(
      (p) => p.active && branches.some((b) => b.id === p.branchId),
    );
    const credential = await this.prisma.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId,
          environment: "HOMOLOGATION",
        },
      },
      select: {
        verifiedAt: true,
        representedCuit: true,
        expiresAt: true,
        ticketExpiresAt: true,
      },
    });
    const readiness = fiscalReadiness(
      organization.fiscalProfile,
      active.length,
    );
    const auth = readiness.checks.find((check) => check.code === "AUTH");
    if (
      auth &&
      credential?.verifiedAt &&
      credential.representedCuit ===
        readFiscalProfile(organization.fiscalProfile).cuit &&
      credential.expiresAt &&
      credential.expiresAt.getTime() > Date.now() &&
      credential.ticketExpiresAt &&
      credential.ticketExpiresAt.getTime() > Date.now()
    ) {
      auth.ready = true;
      auth.detail = `Conexión de homologación comprobada el ${credential.verifiedAt.toISOString()}. Cada prueba revalida el acceso; producción no está habilitada.`;
    }
    return {
      points,
      branches,
      ...readiness,
    };
  }

  async createFiscalPoint(
    actorId: string,
    organizationId: string,
    input: FiscalPointDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    if (
      !Number.isInteger(input.number) ||
      input.number < 1 ||
      input.number > 99999
    )
      throw new BadRequestException(
        "El punto de venta debe estar entre 1 y 99999.",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.findFirst({
          where: {
            id: input.branchId,
            organizationId,
            active: true,
            deletedAt: null,
          },
        });
        if (!branch)
          throw new NotFoundException(
            "Sucursal activa no encontrada en esta organización.",
          );
        const point = await tx.fiscalPoint.create({
          data: {
            organizationId,
            branchId: branch.id,
            number: input.number,
            environment: "HOMOLOGATION",
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId: branch.id,
            actorId,
            entityType: "FISCAL_POINT",
            entityId: point.id,
            action: "CREATED",
            after: { number: point.number, environment: point.environment },
          },
        });
        return point;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException(
          "Ese punto de venta ya existe en homologación para esta organización.",
        );
      throw error;
    }
  }

  async changeFiscalPointStatus(
    actorId: string,
    organizationId: string,
    id: string,
    active: boolean,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.fiscalPoint.findFirst({
        where: { id, organizationId },
      });
      if (!before) throw new NotFoundException("Punto de venta no encontrado.");
      if (
        active &&
        !(await tx.branch.findFirst({
          where: {
            id: before.branchId,
            organizationId,
            active: true,
            deletedAt: null,
          },
        }))
      )
        throw new BadRequestException("La sucursal debe estar activa.");
      const point = await tx.fiscalPoint.update({
        where: { id: before.id },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: before.branchId,
          actorId,
          entityType: "FISCAL_POINT",
          entityId: id,
          action: "STATUS_CHANGED",
          before: { active: before.active },
          after: { active },
        },
      });
      return point;
    });
  }

  async fiscalProfile(actorId: string, organizationId: string) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_READ");
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    return {
      profile: readFiscalProfile(organization.fiscalProfile),
      issuanceEnabled: false,
      status: "NOT_CONNECTED",
    };
  }

  async updateFiscalProfile(
    actorId: string,
    organizationId: string,
    input: FiscalProfileDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    const profile = readFiscalProfile(input);
    validateFiscalDraft(profile);
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { fiscalProfile: { ...profile } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ORGANIZATION",
          entityId: organizationId,
          action: "FISCAL_PROFILE_DRAFT_UPDATED",
          after: { fields: Object.keys(profile), issuanceEnabled: false },
        },
      });
    });
    return { profile, issuanceEnabled: false, status: "NOT_CONNECTED" };
  }

  /** Nombre y datos que salen en cada ticket: los ve cualquier miembro activo. */
  async ticketHeader(actorId: string, organizationId: string) {
    await this.activePermissionCodes(actorId, organizationId);
    return readTicketHeader(
      await this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
      }),
    );
  }
  async updateTicketHeader(
    actorId: string,
    organizationId: string,
    input: TicketHeaderDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    const data = readTicketHeader({ name: input.name, ticketHeader: input });
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { ticketHeader: { ...data } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ORGANIZATION",
          entityId: organizationId,
          action: "TICKET_HEADER_UPDATED",
          after: { ...data },
        },
      });
      return data;
    });
  }

  // Lectura para imprimir: también la necesita quien vende (SALE_READ).
  // Con branchId devuelve además el formato de esa sucursal y el que se usa al vender.
  async documentTemplate(
    actorId: string,
    organizationId: string,
    branchId?: string,
  ) {
    await this.assertPermission(actorId, organizationId, [
      "ORGANIZATION_READ",
      "SALE_READ",
    ]);
    const [organization, branch] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          documentTemplate: true,
          documentLogo: true,
          documentLogoUpdatedAt: true,
        },
      }),
      branchId
        ? this.prisma.branch.findFirst({
            where: { id: branchId, organizationId, deletedAt: null },
            select: { printFormat: true },
          })
        : null,
    ]);
    if (branchId && !branch)
      throw new NotFoundException("La sucursal no está disponible.");
    const template = readDocumentTemplate(organization.documentTemplate);
    const branchFormat = readPrintFormat(branch?.printFormat);
    return {
      ...template,
      branchFormat,
      effectiveFormat: branchFormat ?? template.defaultFormat,
      logo: organization.documentLogo
        ? `data:image/jpeg;base64,${Buffer.from(organization.documentLogo).toString("base64")}`
        : null,
      logoUpdatedAt: organization.documentLogoUpdatedAt,
    };
  }
  async updateBranchPrintFormat(
    actorId: string,
    organizationId: string,
    branchId: string,
    printFormat: PrintFormat | null,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId, deletedAt: null },
        select: { id: true, printFormat: true },
      });
      if (!branch)
        throw new NotFoundException("La sucursal no está disponible.");
      await tx.branch.update({
        where: { id: branchId },
        data: { printFormat },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          actorId,
          entityType: "BRANCH",
          entityId: branchId,
          action: "BRANCH_PRINT_FORMAT_UPDATED",
          before: { printFormat: branch.printFormat },
          after: { printFormat },
        },
      });
      return { branchId, printFormat };
    });
  }
  async updateDocumentTemplate(
    actorId: string,
    organizationId: string,
    input: DocumentTemplateDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      // Se bloquea la fila: dos pantallas guardando a la vez no se pisan los campos.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const current = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { documentTemplate: true },
      });
      const provided = Object.fromEntries(
        // null o ausente = no se cambia ese campo.
        Object.entries(input).filter(([, value]) => value != null),
      );
      const data = readDocumentTemplate({
        ...readDocumentTemplate(current.documentTemplate),
        ...provided,
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { documentTemplate: { ...data } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ORGANIZATION",
          entityId: organizationId,
          action: "DOCUMENT_TEMPLATE_UPDATED",
          after: { ...data },
        },
      });
      return data;
    });
  }
  async saveDocumentLogo(
    actorId: string,
    organizationId: string,
    dataUrl: string | null,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    const content =
      dataUrl === null ? null : new Uint8Array(decodeProductImage(dataUrl));
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.organization.update({
        where: { id: organizationId },
        data: {
          documentLogo: content,
          documentLogoUpdatedAt: content === null ? null : new Date(),
        },
        select: { documentLogoUpdatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "ORGANIZATION",
          entityId: organizationId,
          action:
            content === null ? "DOCUMENT_LOGO_REMOVED" : "DOCUMENT_LOGO_SAVED",
        },
      });
      return { logoUpdatedAt: result.documentLogoUpdatedAt };
    });
  }

  /**
   * Toda la web depende de conocer las sucursales propias: sin ellas un rol de mostrador
   * no puede operar. Ver las de toda la organización sí exige ORGANIZATION_READ.
   */
  async listBranches(actorId: string, organizationId: string) {
    const permissions = await this.activePermissionCodes(
      actorId,
      organizationId,
    );
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(permissions.has("ORGANIZATION_READ")
          ? {}
          : { userMemberships: { some: { userId: actorId } } }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
        address: true,
        city: true,
        province: true,
        phone: true,
        printFormat: true,
        userMemberships: {
          where: { userId: actorId },
          select: { userId: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return branches.map(({ userMemberships, ...branch }) => ({
      ...branch,
      canAccess: userMemberships.length > 0,
    }));
  }

  async createBranch(
    actorId: string,
    organizationId: string,
    name: string,
    code: string | undefined,
    details?: BranchDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertQuotaAvailable(tx, organizationId, "branches");
        const branch = await tx.branch.create({
          data: {
            organizationId,
            name: name.trim(),
            code:
              code?.trim().toUpperCase() ||
              (await generateBranchCode(tx, organizationId, name.trim())),
            address: details?.address?.trim() ?? "",
            city: details?.city?.trim() ?? "",
            province: details?.province?.trim() ?? "",
            phone: details?.phone?.trim() ?? "",
          },
          select: {
            id: true,
            code: true,
            name: true,
            active: true,
            address: true,
            city: true,
            province: true,
            phone: true,
          },
        });
        await tx.userBranch.create({
          data: { userId: actorId, branchId: branch.id },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "BRANCH",
            entityId: branch.id,
            action: "CREATED",
            after: { ...branch },
          },
        });
        return branch;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException("El código de sucursal ya está en uso.");
      throw error;
    }
  }

  async updateBranch(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: BranchDto,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
        const before = await tx.branch.findFirst({
          where: { id: branchId, organizationId, deletedAt: null },
        });
        if (!before) throw new NotFoundException("No se encontró la sucursal.");
        const data = {
          name: input.name.trim(),
          code: input.code?.trim().toUpperCase() ?? before.code,
          address: input.address?.trim() ?? "",
          city: input.city?.trim() ?? "",
          province: input.province?.trim() ?? "",
          phone: input.phone?.trim() ?? "",
        };
        const branch = await tx.branch.update({
          where: { id: branchId },
          data,
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "BRANCH",
            entityId: branchId,
            action: "UPDATED",
            before: {
              name: before.name,
              code: before.code,
              address: before.address,
              city: before.city,
              province: before.province,
              phone: before.phone,
            },
            after: data,
          },
        });
        return branch;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException("El código de sucursal ya está en uso.");
      throw error;
    }
  }

  async changeBranchStatus(
    actorId: string,
    organizationId: string,
    branchId: string,
    active: boolean,
    remove = false,
  ) {
    await this.assertPermission(actorId, organizationId, "ORGANIZATION_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      if (active && !remove) {
        const inactive = await tx.branch.findFirst({
          where: {
            id: branchId,
            organizationId,
            active: false,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (inactive)
          await assertQuotaAvailable(tx, organizationId, "branches");
      }
      // Serialize changes so two requests cannot disable the last two branches.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const before = await tx.branch.findFirst({
        where: { id: branchId, organizationId, deletedAt: null },
      });
      if (!before) throw new NotFoundException("No se encontró la sucursal.");
      if (!active || remove) {
        const remaining = await tx.branch.count({
          where: {
            organizationId,
            active: true,
            deletedAt: null,
            id: { not: branchId },
          },
        });
        if (!remaining)
          throw new ConflictException(
            "Debe quedar al menos una sucursal activa.",
          );
        const registers = await tx.cashRegister.findMany({
          where: { branchId },
          select: { id: true },
        });
        const openCash = await tx.cashSession.count({
          where: {
            cashRegisterId: { in: registers.map(({ id }) => id) },
            closedAt: null,
          },
        });
        if (openCash)
          throw new ConflictException(
            "Cerrá las cajas abiertas de esta sucursal antes de continuar.",
          );
      }
      if (remove) {
        // Only unused branches can disappear from navigation. Historical branches
        // remain available for reactivation; no commercial records are deleted.
        const usage = await Promise.all([
          tx.sale.count({ where: { organizationId, branchId } }),
          tx.purchase.count({ where: { organizationId, branchId } }),
          tx.productLot.count({ where: { organizationId, branchId } }),
          tx.inventoryMovement.count({ where: { organizationId, branchId } }),
          tx.transfer.count({
            where: {
              organizationId,
              OR: [
                { sourceBranchId: branchId },
                { destinationBranchId: branchId },
              ],
            },
          }),
          tx.customerAccountMovement.count({
            where: { organizationId, branchId },
          }),
          tx.cashRegister.count({ where: { branchId } }),
          tx.customerReturn.count({ where: { organizationId, branchId } }),
          tx.supplierReturn.count({ where: { organizationId, branchId } }),
        ]);
        if (usage.some(Boolean))
          throw new ConflictException(
            "Esta sucursal tiene registros vinculados. Podés desactivarla, pero no eliminarla.",
          );
      }
      const branch = await tx.branch.update({
        where: { id: branchId },
        data: {
          active: remove ? false : active,
          ...(remove ? { deletedAt: new Date() } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "BRANCH",
          entityId: branchId,
          action: remove ? "ARCHIVED" : active ? "ACTIVATED" : "DEACTIVATED",
          before: { active: before.active },
          after: { active: branch.active, removed: remove },
        },
      });
      return { id: branch.id, active: branch.active };
    });
  }

  // Acepta un código o varios alternativos (alcanza con tener uno).
  private async assertPermission(
    actorId: string,
    organizationId: string,
    permissionCode: string | readonly string[],
  ): Promise<void> {
    const codes =
      typeof permissionCode === "string" ? [permissionCode] : permissionCode;
    const permissions = await this.activePermissionCodes(
      actorId,
      organizationId,
    );
    if (!codes.some((code) => permissions.has(code)))
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }

  private async activePermissionCodes(
    actorId: string,
    organizationId: string,
  ): Promise<Set<string>> {
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
    if (!membership?.active)
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
    return new Set(
      membership.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.code),
      ),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
