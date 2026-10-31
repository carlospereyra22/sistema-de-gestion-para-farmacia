import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type FiscalCredential } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import {
  readFiscalProfile,
  validateFiscalDraft,
} from "../organizations/fiscal-profile";
import {
  type FiscalEnvironment,
  assertFiscalEnvironment,
  fiscalCredentialContext,
} from "./fiscal-environment";
import { CredentialVault } from "./credential-vault";
import {
  createCertificateRequest,
  inspectCertificate,
} from "./certificate-files";
import type {
  PrepareCredentialDto,
  UploadCredentialDto,
} from "./fiscal-credentials.dto";

@Injectable()
export class FiscalCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly vault: CredentialVault,
  ) {}
  private context(org: string, environment: FiscalEnvironment) {
    assertFiscalEnvironment(environment);
    return fiscalCredentialContext(org, environment);
  }
  private assertStorage(environment: FiscalEnvironment) {
    assertFiscalEnvironment(environment);
    if (environment === "PRODUCTION" && this.vault.provider() !== "AES256_GCM")
      throw new BadRequestException(
        "Producción requiere custodia cifrada y recuperable en el servidor. Usá la instalación publicada.",
      );
  }
  private describe(
    value: FiscalCredential | null,
    representedCuit: string,
    environment: FiscalEnvironment,
  ) {
    return {
      environment,
      storage:
        environment === "PRODUCTION" && this.vault.provider() !== "AES256_GCM"
          ? "UNAVAILABLE"
          : this.vault.provider(),
      issuanceEnabled: false,
      version: value?.version ?? 0,
      hasRequest: !!value?.csr,
      hasCertificate: !!value?.certificate,
      holderCuit: value?.holderCuit ?? "",
      representedCuit,
      profileMatches: !value || value.representedCuit === representedCuit,
      fingerprint: value?.fingerprint ?? null,
      expiresAt: value?.expiresAt?.toISOString() ?? null,
      status: !value
        ? "EMPTY"
        : value.certificate
          ? "FILES_VALIDATED_PENDING_ARCA"
          : "REQUEST_PREPARED",
    };
  }
  async status(
    actor: string,
    org: string,
    environment: FiscalEnvironment = "HOMOLOGATION",
  ) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const value = await this.prisma.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId: org,
          environment,
        },
      },
    });
    return this.describe(
      value,
      readFiscalProfile(organization.fiscalProfile).cuit,
      environment,
    );
  }
  async request(
    actor: string,
    org: string,
    environment: FiscalEnvironment = "HOMOLOGATION",
  ) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    const value = await this.prisma.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId: org,
          environment,
        },
      },
    });
    if (!value?.csr)
      throw new NotFoundException(
        "Primero prepará la solicitud de certificado.",
      );
    return {
      csr: value.csr,
      holderCuit: value.holderCuit,
      filename: `solicitud-arca-${environment === "PRODUCTION" ? "produccion" : "pruebas"}-${value.holderCuit}.csr`,
    };
  }
  private async locked<T>(
    org: string,
    holderCuit: string,
    environment: FiscalEnvironment,
    fn: (
      tx: Prisma.TransactionClient,
      current: FiscalCredential | null,
      cuit: string,
      name: string,
    ) => Promise<T>,
  ) {
    validateFiscalDraft({ ...readFiscalProfile(null), cuit: holderCuit });
    if (!/^\d{11}$/.test(holderCuit))
      throw new BadRequestException(
        "Indicá el CUIT del titular del certificado.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${this.context(org, environment)}, 0))`;
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: org },
        });
        const profile = readFiscalProfile(organization.fiscalProfile);
        validateFiscalDraft(profile);
        if (!profile.cuit || !profile.legalName)
          throw new BadRequestException(
            "Guardá primero el CUIT y la razón social de la farmacia.",
          );
        const current = await tx.fiscalCredential.findUnique({
          where: {
            organizationId_environment: {
              organizationId: org,
              environment,
            },
          },
        });
        return fn(tx, current, profile.cuit, profile.legalName);
      },
      { timeout: 20000 },
    );
  }
  async prepare(
    actor: string,
    org: string,
    input: PrepareCredentialDto,
    environment: FiscalEnvironment = "HOMOLOGATION",
  ) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    this.assertStorage(environment);
    return this.locked(
      org,
      input.holderCuit,
      environment,
      async (tx, current, cuit, name) => {
        if (
          !input.replace &&
          current?.csr &&
          current.holderCuit === input.holderCuit &&
          current.representedCuit === cuit
        )
          return this.describe(current, cuit, environment);
        if (current && !input.replace)
          throw new ConflictException(
            "Ya hay una configuración. Confirmá su reemplazo para generar otra solicitud.",
          );
        if ((current?.version ?? 0) !== input.expectedVersion)
          throw new ConflictException(
            "La configuración cambió. Actualizá la pantalla antes de continuar.",
          );
        const generated = await createCertificateRequest(
          name,
          input.holderCuit,
        );
        const encryptedPrivateKey = await this.vault.seal(
          generated.privateKey,
          this.context(org, environment),
        );
        const data = {
          representedCuit: cuit,
          holderCuit: input.holderCuit,
          encryptedPrivateKey,
          encryptedTicket: null,
          ticketExpiresAt: null,
          verifiedAt: null,
          csr: generated.csr,
          certificate: null,
          fingerprint: null,
          expiresAt: null,
          version: (current?.version ?? 0) + 1,
        };
        const value = current
          ? await tx.fiscalCredential.update({
              where: { id: current.id },
              data,
            })
          : await tx.fiscalCredential.create({
              data: { organizationId: org, environment, ...data },
            });
        await this.audit(
          tx,
          actor,
          org,
          value.id,
          "REQUEST_PREPARED",
          value.version,
          environment,
        );
        return this.describe(value, cuit, environment);
      },
    );
  }
  async upload(
    actor: string,
    org: string,
    input: UploadCredentialDto,
    environment: FiscalEnvironment = "HOMOLOGATION",
  ) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    this.assertStorage(environment);
    return this.locked(
      org,
      input.holderCuit,
      environment,
      async (tx, current, cuit) => {
        if ((current?.version ?? 0) !== input.expectedVersion)
          throw new ConflictException(
            "La configuración cambió. Actualizá la pantalla antes de continuar.",
          );
        if (
          current &&
          (input.privateKey || current.certificate) &&
          !input.replace
        )
          throw new ConflictException(
            "Confirmá el reemplazo de los archivos anteriores.",
          );
        if (
          current &&
          !input.privateKey &&
          (current.holderCuit !== input.holderCuit ||
            current.representedCuit !== cuit)
        )
          throw new BadRequestException(
            "Los CUIT cambiaron desde la solicitud. Prepará una nueva solicitud o cargá el par de archivos correcto.",
          );
        const privateKey =
          input.privateKey ??
          (current
            ? await this.vault.open(
                current.encryptedPrivateKey,
                this.context(org, environment),
              )
            : "");
        if (!privateKey)
          throw new BadRequestException(
            "Cargá también la clave privada .key que corresponde al certificado, o prepará una solicitud nueva.",
          );
        const checked = inspectCertificate(
          input.certificate,
          privateKey,
          input.holderCuit,
          input.passphrase,
        );
        const encryptedPrivateKey = await this.vault.seal(
          checked.privateKey,
          this.context(org, environment),
        );
        const data = {
          representedCuit: cuit,
          holderCuit: input.holderCuit,
          encryptedPrivateKey,
          encryptedTicket: null,
          ticketExpiresAt: null,
          verifiedAt: null,
          certificate: checked.certificate,
          fingerprint: checked.fingerprint,
          expiresAt: checked.expiresAt,
          csr: input.privateKey ? null : (current?.csr ?? null),
          version: (current?.version ?? 0) + 1,
        };
        const value = current
          ? await tx.fiscalCredential.update({
              where: { id: current.id },
              data,
            })
          : await tx.fiscalCredential.create({
              data: { organizationId: org, environment, ...data },
            });
        await this.audit(
          tx,
          actor,
          org,
          value.id,
          "FILES_VALIDATED_LOCALLY",
          value.version,
          environment,
        );
        return this.describe(value, cuit, environment);
      },
    );
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    entityId: string,
    action: string,
    version: number,
    environment: FiscalEnvironment,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        entityType: "FISCAL_CREDENTIAL",
        entityId,
        action,
        after: { version, environment },
      },
    });
  }
}
