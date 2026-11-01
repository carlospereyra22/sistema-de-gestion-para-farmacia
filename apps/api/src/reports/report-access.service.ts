import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ALL_BRANCHES,
  type ReportComparison,
  type ReportFilterOptions,
} from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { parseReportPeriod, type ReportPeriod } from "./report-period";

export type ReportAccess = ReportFilterOptions["access"];

export type ReportScope = {
  period: ReportPeriod;
  /** Sucursales que entran en el calculo; siempre autorizadas y activas. */
  branchIds: string[];
  access: ReportAccess;
};

/**
 * Permisos y sucursales de reportes. Toda consulta de reportes pasa por aca: el
 * `branchId` que manda el navegador nunca se usa sin validarlo contra `UserBranch`.
 */
@Injectable()
export class ReportAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Exige REPORT_READ y devuelve que secciones puede ver el usuario. */
  async access(actorId: string, organizationId: string): Promise<ReportAccess> {
    const member = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      select: {
        active: true,
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    const codes = new Set(
      member?.active
        ? member.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          )
        : [],
    );
    if (!codes.has("REPORT_READ"))
      throw new ForbiddenException("No tenés permiso para ver reportes.");
    return {
      profitability: codes.has("REPORT_PROFIT_READ"),
      purchases: codes.has("PURCHASE_READ"),
      customers: codes.has("ACCOUNT_READ"),
      export: codes.has("REPORT_EXPORT"),
    };
  }

  /** Sucursales activas de la organizacion asignadas al usuario, por nombre. */
  branches(actorId: string, organizationId: string) {
    return this.prisma.branch.findMany({
      where: {
        organizationId,
        active: true,
        deletedAt: null,
        userMemberships: { some: { userId: actorId } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Resuelve periodo y sucursales. "all" (o sin valor) = todas las autorizadas al
   * momento de consultar; una sucursal concreta tiene que estar autorizada.
   */
  async scope(
    actorId: string,
    organizationId: string,
    filters: {
      branchId?: string;
      from?: string;
      to?: string;
      comparison?: ReportComparison;
    },
    now = new Date(),
  ): Promise<ReportScope> {
    const access = await this.access(actorId, organizationId);
    const period = parseReportPeriod(filters, now);
    const allowed = await this.branches(actorId, organizationId);
    const branchId = filters.branchId ?? ALL_BRANCHES;
    const branchIds =
      branchId === ALL_BRANCHES
        ? allowed.map((branch) => branch.id)
        : allowed.some((branch) => branch.id === branchId.toLowerCase())
          ? [branchId.toLowerCase()]
          : [];
    if (!branchIds.length)
      throw new ForbiddenException(
        "No tenés acceso a la sucursal seleccionada.",
      );
    return { period, branchIds, access };
  }

  async filterOptions(
    actorId: string,
    organizationId: string,
  ): Promise<ReportFilterOptions> {
    const access = await this.access(actorId, organizationId);
    const [branches, categories, laboratories, suppliers] = await Promise.all([
      this.branches(actorId, organizationId),
      this.prisma.category.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.laboratory.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      access.purchases
        ? this.prisma.supplier.findMany({
            where: { organizationId, active: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [],
    ]);
    return { branches, categories, laboratories, suppliers, access };
  }
}
