import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import { CredentialVault } from "./credential-vault";
import {
  ArcaSoap,
  PADRON_SERVICE,
  escapeXml,
  obj,
  parseXml,
  signedLogin,
  str,
} from "./arca-soap";
import type { FiscalEnvironment } from "./fiscal-environment";
import { cuitValido, datosDePadron } from "./padron-arca";
import { contextoPadronPlataforma } from "../platform/platform-padron.service";

type AccesoPadron = {
  environment: FiscalEnvironment;
  token: string;
  sign: string;
  /** CUIT con el que se consulta (cuitRepresentada). */
  cuit: string;
};

/**
 * Consulta de un CUIT en el padrón de ARCA (SISTEMA-70), para completar la
 * ficha de un cliente. Usa el certificado de la farmacia: el de producción si
 * está cargado (y no es el entorno local de pruebas) y si no el de
 * homologación. Sólo consulta: no emite nada.
 */
@Injectable()
export class PadronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CredentialVault,
    private readonly soap: ArcaSoap,
  ) {}

  async consultar(actorId: string, organizationId: string, valor: string) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    const cuit = cuitValido(valor);
    try {
      return await this.consultarEnArca(organizationId, cuit);
    } catch (cause) {
      // Un 502 la web lo toma como corte de internet: los problemas con ARCA
      // se devuelven como 422, con su mensaje, para que se vea el motivo real.
      if (cause instanceof BadGatewayException)
        throw new UnprocessableEntityException(cause.message);
      throw cause;
    }
  }

  private async consultarEnArca(organizationId: string, cuit: string) {
    const acceso = await this.acceso(organizationId);
    const persona = await this.soap.call(
      "padron",
      "getPersona_v2",
      `<token>${escapeXml(acceso.token)}</token><sign>${escapeXml(acceso.sign)}</sign><cuitRepresentada>${escapeXml(acceso.cuit)}</cuitRepresentada><idPersona>${cuit}</idPersona>`,
      acceso.environment,
    );
    const datos = datosDePadron(cuit, persona);
    if (!datos)
      throw new BadGatewayException("ARCA no devolvió datos para ese CUIT.");
    return { ...datos, environment: acceso.environment };
  }

  /** ¿Se puede consultar producción? Nunca en el entorno local de pruebas. */
  private produccionDisponible() {
    return (
      this.vault.provider() === "AES256_GCM" &&
      process.env.FISCAL_LOCAL_TESTING !== "true"
    );
  }

  /**
   * Acceso de ARCA para el padrón. Primero el certificado de Farmatec, que
   * sirve para todas las farmacias; si no está cargado, el de la farmacia.
   */
  private async acceso(organizationId: string): Promise<AccesoPadron> {
    return (
      (await this.accesoDePlataforma()) ??
      (await this.accesoDeFarmacia(organizationId))
    );
  }

  private async accesoDePlataforma(): Promise<AccesoPadron | null> {
    const ambientes: FiscalEnvironment[] = this.produccionDisponible()
      ? ["PRODUCTION", "HOMOLOGATION"]
      : ["HOMOLOGATION"];
    for (const environment of ambientes) {
      const vigente = await this.prisma.platformPadronCredential.findFirst({
        where: {
          environment,
          certificate: { not: null },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!vigente) continue;
      return this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contextoPadronPlataforma(environment)},0))`;
          const value = await tx.platformPadronCredential.findUniqueOrThrow({
            where: { environment },
          });
          const context = `${contextoPadronPlataforma(environment)}:acceso:${value.version}`;
          const guardado = await this.accesoGuardado(
            value.encryptedTicket,
            value.ticketExpiresAt,
            context,
          );
          if (guardado) return { environment, ...guardado, cuit: value.cuit };
          const nuevo = await this.pedirAcceso(
            value.certificate!,
            await this.vault.open(
              value.encryptedPrivateKey,
              contextoPadronPlataforma(environment),
            ),
            environment,
            "Farmatec",
          );
          await tx.platformPadronCredential.update({
            where: { id: value.id },
            data: {
              encryptedTicket: await this.vault.seal(
                JSON.stringify(nuevo),
                context,
              ),
              ticketExpiresAt: nuevo.expires,
            },
          });
          return {
            environment,
            token: nuevo.token,
            sign: nuevo.sign,
            cuit: value.cuit,
          };
        },
        { timeout: 45000, maxWait: 5000 },
      );
    }
    return null;
  }

  private async accesoDeFarmacia(
    organizationId: string,
  ): Promise<AccesoPadron> {
    const produccion = await this.prisma.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId,
          environment: "PRODUCTION",
        },
      },
      select: { certificate: true, expiresAt: true },
    });
    const environment: FiscalEnvironment =
      produccion?.certificate &&
      produccion.expiresAt &&
      produccion.expiresAt.getTime() > Date.now() &&
      this.produccionDisponible()
        ? "PRODUCTION"
        : "HOMOLOGATION";
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fiscal-padron:v1:${environment}:${organizationId}`},0))`;
        const value = await tx.fiscalCredential.findUnique({
          where: {
            organizationId_environment: { organizationId, environment },
          },
        });
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
        });
        const profile = readFiscalProfile(organization.fiscalProfile);
        if (
          !value?.certificate ||
          !value.expiresAt ||
          value.expiresAt.getTime() <= Date.now() ||
          value.representedCuit !== profile.cuit
        )
          throw new BadRequestException(
            "La búsqueda en ARCA todavía no está configurada: falta el certificado del padrón de la plataforma.",
          );
        const context = `fiscal-padron:${environment}:${organizationId}:${value.version}`;
        const guardado = await this.accesoGuardado(
          value.encryptedPadronTicket,
          value.padronTicketExpiresAt,
          context,
        );
        if (guardado) return { environment, ...guardado, cuit: profile.cuit };
        const nuevo = await this.pedirAcceso(
          value.certificate,
          await this.vault.open(
            value.encryptedPrivateKey,
            `fiscal-credential:v1:${environment}:${organizationId}`,
          ),
          environment,
          "de la farmacia",
        );
        await tx.fiscalCredential.update({
          where: { id: value.id },
          data: {
            encryptedPadronTicket: await this.vault.seal(
              JSON.stringify(nuevo),
              context,
            ),
            padronTicketExpiresAt: nuevo.expires,
          },
        });
        return {
          environment,
          token: nuevo.token,
          sign: nuevo.sign,
          cuit: profile.cuit,
        };
      },
      { timeout: 45000, maxWait: 5000 },
    );
  }

  /** El acceso guardado, si sigue vigente al menos un minuto más. */
  private async accesoGuardado(
    cifrado: string | null,
    vence: Date | null,
    context: string,
  ) {
    if (!cifrado || !vence || vence.getTime() <= Date.now() + 60000)
      return null;
    const guardado = obj(
      JSON.parse(await this.vault.open(cifrado, context)) as unknown,
    );
    return str(guardado.token) && str(guardado.sign)
      ? { token: str(guardado.token), sign: str(guardado.sign) }
      : null;
  }

  /** Pide a ARCA el acceso al padrón con ese certificado. */
  private async pedirAcceso(
    certificate: string,
    privateKey: string,
    environment: FiscalEnvironment,
    deQuien: string,
  ) {
    let response: Record<string, unknown>;
    try {
      response = await this.soap.call(
        "wsaa",
        "loginCms",
        `<in0>${signedLogin(certificate, privateKey, PADRON_SERVICE)}</in0>`,
        environment,
      );
    } catch (cause) {
      const codigo =
        cause && typeof cause === "object" && "arcaFault" in cause
          ? String(cause.arcaFault)
          : cause instanceof Error
            ? cause.message
            : "";
      throw new BadGatewayException(
        `ARCA no dio acceso al padrón con el certificado ${deQuien} (${environment === "PRODUCTION" ? "producción" : "homologación"}). ${/alreadyAuthenticated/i.test(codigo) ? "ARCA ya entregó un acceso vigente a otra instalación con este certificado: esperá a que venza (hasta 12 horas)." : "Revisá que el certificado tenga autorizado el servicio ws_sr_constancia_inscripcion."} Respuesta de ARCA: ${codigo || "sin detalle"}.`,
      );
    }
    const ticket = obj(
      parseXml(str(response.loginCmsReturn)).loginTicketResponse,
    );
    const credentials = obj(ticket.credentials);
    const expires = new Date(str(obj(ticket.header).expirationTime));
    if (
      !str(credentials.token) ||
      !str(credentials.sign) ||
      !Number.isFinite(expires.getTime()) ||
      expires.getTime() <= Date.now() + 60000
    )
      throw new BadGatewayException("ARCA no devolvió un acceso vigente.");
    return {
      token: str(credentials.token),
      sign: str(credentials.sign),
      expires,
    };
  }

  private async assert(actorId: string, organizationId: string, code: string) {
    const member = await this.prisma.userOrganization.findUnique({
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
    if (
      !member?.active ||
      !member.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
