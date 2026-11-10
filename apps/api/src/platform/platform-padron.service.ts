import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PlatformPadronCredential } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialVault } from "../fiscal/credential-vault";
import {
  createCertificateRequest,
  inspectCertificate,
} from "../fiscal/certificate-files";
import {
  assertFiscalEnvironment,
  type FiscalEnvironment,
} from "../fiscal/fiscal-environment";
import { recordPlatformAudit } from "./platform-audit";

/** Contexto de cifrado de la clave privada del certificado del padrón. */
export const contextoPadronPlataforma = (environment: FiscalEnvironment) =>
  `platform-padron:v1:${environment}`;

/**
 * Certificado de Farmatec para consultar el padrón de ARCA en nombre de la
 * plataforma (SISTEMA-70). Mismo circuito que los de facturación: se genera
 * la solicitud (CSR) en el servidor, se sube a ARCA y se carga el certificado
 * que devuelve. La clave privada nunca sale del servidor.
 */
@Injectable()
export class PlatformPadronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CredentialVault,
  ) {}

  private ambiente(environment: string): FiscalEnvironment {
    assertFiscalEnvironment(environment);
    if (environment === "PRODUCTION" && this.vault.provider() !== "AES256_GCM")
      throw new BadRequestException(
        "Producción requiere custodia cifrada en el servidor. Usá la instalación publicada.",
      );
    return environment;
  }

  private describir(
    environment: FiscalEnvironment,
    value: PlatformPadronCredential | null,
  ) {
    return {
      environment,
      cuit: value?.cuit ?? "",
      version: value?.version ?? 0,
      hasRequest: Boolean(value?.csr),
      hasCertificate: Boolean(value?.certificate),
      fingerprint: value?.fingerprint ?? null,
      expiresAt: value?.expiresAt?.toISOString() ?? null,
      storage:
        environment === "PRODUCTION" && this.vault.provider() !== "AES256_GCM"
          ? "UNAVAILABLE"
          : this.vault.provider(),
    };
  }

  async estado(environment: string) {
    assertFiscalEnvironment(environment);
    return this.describir(
      environment,
      await this.prisma.platformPadronCredential.findUnique({
        where: { environment },
      }),
    );
  }

  async solicitud(environment: string) {
    assertFiscalEnvironment(environment);
    const value = await this.prisma.platformPadronCredential.findUnique({
      where: { environment },
    });
    if (!value?.csr)
      throw new NotFoundException(
        "Primero generá la solicitud del certificado.",
      );
    return {
      csr: value.csr,
      filename: `solicitud-padron-${environment === "PRODUCTION" ? "produccion" : "pruebas"}-${value.cuit}.csr`,
    };
  }

  /** Genera la clave y la solicitud (CSR) para subir a ARCA. */
  async preparar(
    actorId: string,
    input: {
      environment: string;
      cuit: string;
      expectedVersion: number;
      replace?: boolean;
    },
  ) {
    const environment = this.ambiente(input.environment);
    if (!/^\d{11}$/.test(input.cuit))
      throw new BadRequestException("Indicá el CUIT de 11 números.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contextoPadronPlataforma(environment)}, 0))`;
      const current = await tx.platformPadronCredential.findUnique({
        where: { environment },
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException(
          "La configuración cambió. Actualizá la pantalla antes de continuar.",
        );
      if (current?.certificate && !input.replace)
        throw new ConflictException(
          "Ya hay un certificado cargado. Confirmá su reemplazo para generar otra solicitud.",
        );
      const generated = await createCertificateRequest("Farmatec", input.cuit);
      const data = {
        cuit: input.cuit,
        encryptedPrivateKey: await this.vault.seal(
          generated.privateKey,
          contextoPadronPlataforma(environment),
        ),
        csr: generated.csr,
        certificate: null,
        fingerprint: null,
        expiresAt: null,
        encryptedTicket: null,
        ticketExpiresAt: null,
        version: (current?.version ?? 0) + 1,
      };
      const value = current
        ? await tx.platformPadronCredential.update({
            where: { id: current.id },
            data,
          })
        : await tx.platformPadronCredential.create({
            data: { environment, ...data },
          });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PADRON_CERTIFICADO_SOLICITUD",
        entityType: "PLATFORM_PADRON_CREDENTIAL",
        entityId: value.id,
        after: { environment, cuit: input.cuit, version: value.version },
      });
      return this.describir(environment, value);
    });
  }

  /** Carga el certificado que devolvió ARCA para la solicitud generada. */
  async cargar(
    actorId: string,
    input: {
      environment: string;
      certificate: string;
      expectedVersion: number;
    },
  ) {
    const environment = this.ambiente(input.environment);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contextoPadronPlataforma(environment)}, 0))`;
      const current = await tx.platformPadronCredential.findUnique({
        where: { environment },
      });
      if (!current)
        throw new BadRequestException(
          "Primero generá la solicitud del certificado.",
        );
      if (current.version !== input.expectedVersion)
        throw new ConflictException(
          "La configuración cambió. Actualizá la pantalla antes de continuar.",
        );
      const checked = inspectCertificate(
        input.certificate,
        await this.vault.open(
          current.encryptedPrivateKey,
          contextoPadronPlataforma(environment),
        ),
        current.cuit,
      );
      const value = await tx.platformPadronCredential.update({
        where: { id: current.id },
        data: {
          certificate: checked.certificate,
          fingerprint: checked.fingerprint,
          expiresAt: checked.expiresAt,
          encryptedTicket: null,
          ticketExpiresAt: null,
          version: current.version + 1,
        },
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PADRON_CERTIFICADO_CARGADO",
        entityType: "PLATFORM_PADRON_CREDENTIAL",
        entityId: value.id,
        after: {
          environment,
          cuit: value.cuit,
          fingerprint: value.fingerprint,
          expiresAt: value.expiresAt?.toISOString() ?? null,
          version: value.version,
        },
      });
      return this.describir(environment, value);
    });
  }
}
