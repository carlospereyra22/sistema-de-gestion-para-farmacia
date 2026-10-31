import {
  Injectable,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import {
  readFiscalProfile,
  validateFiscalDraft,
} from "../organizations/fiscal-profile";
import { fiscalReadiness } from "../organizations/fiscal-readiness";
import { ArcaConnectionService } from "./arca-connection.service";
import { CredentialVault } from "./credential-vault";
import { assertProductionIssuance } from "./production-document";

@Injectable()
export class ProductionConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly connection: ArcaConnectionService,
    private readonly vault: CredentialVault,
  ) {}
  async validate(tx: Prisma.TransactionClient, org: string, branch: string) {
    assertProductionIssuance();
    if (this.vault.provider() !== "AES256_GCM")
      throw new BadRequestException(
        "Producción requiere custodia AES recuperable.",
      );
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const profile = readFiscalProfile(organization.fiscalProfile);
    validateFiscalDraft(profile);
    if (
      !fiscalReadiness(profile, 1).checks[0]?.ready ||
      !["MONOTAX", "EXEMPT"].includes(profile.vatCondition) ||
      !profile.grossIncomeId
    )
      throw new BadRequestException(
        "Completá el perfil fiscal, incluyendo IIBB. Este circuito admite factura C para monotributo/exento.",
      );
    const configuration = await tx.fiscalProductionConfiguration.findFirst({
      where: {
        organizationId: org,
        branchId: branch,
        enabled: true,
        exclusiveConfirmed: true,
      },
    });
    const credential = await tx.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId: org,
          environment: "PRODUCTION",
        },
      },
    });
    if (
      !configuration ||
      !credential?.certificate ||
      !credential.verifiedAt ||
      !credential.expiresAt ||
      credential.expiresAt.getTime() <= Date.now() ||
      credential.representedCuit !== profile.cuit ||
      configuration.issuerCuit !== profile.cuit ||
      configuration.credentialVersion !== credential.version
    )
      throw new BadRequestException(
        "Revisá la activación productiva de la sucursal y el certificado vigente del emisor.",
      );
    return { organization, profile, configuration };
  }
  async activate(
    actor: string,
    org: string,
    branch: string,
    point: number,
    exclusive: boolean,
  ) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    assertProductionIssuance();
    if (!exclusive || !Number.isInteger(point) || point < 1 || point > 99999)
      throw new BadRequestException(
        "Confirmá un punto exclusivo para esta sucursal.",
      );
    if (process.env.FISCAL_RECOVERY_VERIFIED !== "yes")
      throw new BadRequestException(
        "Falta verificar el respaldo externo y la recuperación del custodio fiscal antes de activar.",
      );
    const access = await this.connection.access(
      actor,
      org,
      "setup",
      "PRODUCTION",
      true,
    );
    if (!(await this.connection.points(access)).some((p) => p.number === point))
      throw new BadRequestException("ARCA no habilitó este punto para CAE.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`production-config:${org}`},0))`;
      const branchRecord = await tx.branch.findFirst({
        where: { id: branch, organizationId: org, active: true },
      });
      if (!branchRecord)
        throw new BadRequestException("Sucursal no disponible.");
      const prior = await tx.fiscalProductionConfiguration.findUnique({
        where: { branchId: branch },
      });
      if (prior && (prior.point !== point || prior.issuerCuit !== access.cuit))
        throw new ConflictException(
          "No se reasigna un punto productivo existente; requiere una migración fiscal controlada.",
        );
      await tx.fiscalProductionConfiguration.upsert({
        where: { branchId: branch },
        create: {
          organizationId: org,
          branchId: branch,
          point,
          issuerCuit: access.cuit,
          credentialVersion: access.version,
          enabled: true,
          exclusiveConfirmed: true,
          activatedAt: new Date(),
        },
        update: {
          credentialVersion: access.version,
          enabled: true,
          exclusiveConfirmed: true,
          activatedAt: new Date(),
        },
      });
      await this.validate(tx, org, branch);
      await tx.auditLog.create({
        data: {
          organizationId: org,
          branchId: branch,
          actorId: actor,
          entityType: "FISCAL_PRODUCTION_CONFIGURATION",
          entityId: branch,
          action: "ACTIVATED",
          after: {
            point,
            issuerCuit: access.cuit,
            credentialVersion: access.version,
            exclusiveConfirmed: true,
          },
        },
      });
      return { environment: "PRODUCTION", point, issuanceEnabled: true };
    });
  }
}
