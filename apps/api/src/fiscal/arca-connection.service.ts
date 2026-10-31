import {
  BadRequestException,
  BadGatewayException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import {
  type FiscalEnvironment,
  assertFiscalEnvironment,
} from "./fiscal-environment";
import { CredentialVault } from "./credential-vault";
import {
  ArcaSoap,
  obj,
  str,
  list,
  parseXml,
  escapeXml,
  signedLogin,
  arcaMessages,
} from "./arca-soap";

export type ArcaAccess = {
  environment?: FiscalEnvironment;
  token: string;
  sign: string;
  cuit: string;
  version: number;
};
export const authXml = (a: ArcaAccess) =>
  `<Auth><Token>${escapeXml(a.token)}</Token><Sign>${escapeXml(a.sign)}</Sign><Cuit>${escapeXml(a.cuit)}</Cuit></Auth>`;
@Injectable()
export class ArcaConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly vault: CredentialVault,
    private readonly soap: ArcaSoap,
  ) {}
  async access(
    actor: string,
    org: string,
    purpose: "setup" | "sale" = "setup",
    environment: FiscalEnvironment = "HOMOLOGATION",
    cachedOnly = false,
  ): Promise<ArcaAccess> {
    assertFiscalEnvironment(environment);
    if (environment === "PRODUCTION" && this.vault.provider() !== "AES256_GCM")
      throw new BadRequestException(
        "Producción requiere el custodio cifrado del servidor.",
      );
    if (purpose === "sale")
      await this.organizations.authorizeFiscalSale(actor, org);
    else await this.organizations.authorizeFiscalManagement(actor, org);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fiscal-credential:v1:${environment}:${org}`},0))`;
        const value = await tx.fiscalCredential.findUnique({
          where: {
            organizationId_environment: {
              organizationId: org,
              environment,
            },
          },
        });
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: org },
        });
        const profile = readFiscalProfile(organization.fiscalProfile);
        if (
          !value?.certificate ||
          !value.expiresAt ||
          value.expiresAt.getTime() <= Date.now()
        )
          throw new BadRequestException(
            "Cargá un certificado vigente del ambiente seleccionado.",
          );
        if (value.representedCuit !== profile.cuit)
          throw new BadRequestException(
            "Cambió el CUIT de la farmacia. Revisá su configuración antes de conectar.",
          );
        const context = `fiscal-access:${environment}:${org}:${value.version}`;
        if (
          value.encryptedTicket &&
          value.ticketExpiresAt &&
          value.ticketExpiresAt.getTime() > Date.now() + 60000
        ) {
          const ticket = obj(
            JSON.parse(
              await this.vault.open(value.encryptedTicket, context),
            ) as unknown,
          );
          if (str(ticket.token) && str(ticket.sign))
            return {
              environment,
              token: str(ticket.token),
              sign: str(ticket.sign),
              cuit: profile.cuit,
              version: value.version,
            };
        }
        if (cachedOnly)
          throw new BadRequestException(
            "Primero comprobá el certificado para iniciar la conexión con ARCA.",
          );
        const privateKey = await this.vault.open(
          value.encryptedPrivateKey,
          `fiscal-credential:v1:${environment}:${org}`,
        );
        const response = await this.soap.call(
          "wsaa",
          "loginCms",
          `<in0>${signedLogin(value.certificate, privateKey)}</in0>`,
          environment,
        );
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
        const access = {
          environment,
          token: str(credentials.token),
          sign: str(credentials.sign),
          cuit: profile.cuit,
          version: value.version,
        };
        await tx.fiscalCredential.update({
          where: { id: value.id },
          data: {
            encryptedTicket: await this.vault.seal(
              JSON.stringify(access),
              context,
            ),
            ticketExpiresAt: expires,
          },
        });
        return access;
      },
      { timeout: 45000, maxWait: 5000 },
    );
  }
  async points(access: ArcaAccess) {
    const result = await this.soap.call(
      "wsfe",
      "FEParamGetPtosVenta",
      authXml(access),
      access.environment ?? "HOMOLOGATION",
    );
    const error = arcaMessages(result);
    const errors = list(obj(result.Errors).Err);
    if (
      errors.length > 0 &&
      errors.every((item) => str(obj(item).Code) === "602")
    )
      return [];
    if (error) throw new BadRequestException(`ARCA: ${error}`);
    const listed = list(obj(result.ResultGet).PtoVenta);
    const available = listed
      .map((value) => {
        const point = obj(value);
        return {
          number: Number(str(point.Nro)),
          blocked: str(point.Bloqueado),
          type: str(point.EmisionTipo),
          closed: str(point.FchBaja),
        };
      })
      .filter(
        (p) =>
          Number.isInteger(p.number) &&
          p.number > 0 &&
          p.number <= 99999 &&
          p.blocked === "N" &&
          (!p.closed || p.closed === "NULL") &&
          // WSFE production also returns this explicit label for monotributo.
          // Do not use startsWith("CAE"): it would include CAEA.
          (p.type === "CAE" || p.type === "CAE - Monotributo"),
      );
    if (listed.length > 0 && available.length === 0)
      throw new BadRequestException(
        "ARCA devolvió puntos, pero ninguno está activo y habilitado para CAE.",
      );
    return available;
  }
  async connect(actor: string, org: string) {
    const access = await this.access(actor, org);
    const points = await this.points(access);
    await this.prisma.fiscalCredential.updateMany({
      where: {
        organizationId: org,
        representedCuit: access.cuit,
        version: access.version,
        environment: "HOMOLOGATION",
      },
      data: { verifiedAt: new Date() },
    });
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const profile = readFiscalProfile(organization.fiscalProfile);
    return {
      environment: "HOMOLOGATION",
      connected: true,
      points: points.map((p) => ({ number: p.number })),
      trialType: profile.vatCondition === "REGISTERED" ? 6 : 11,
      totalMinor: profile.vatCondition === "REGISTERED" ? 12100 : 10000,
      message: points.length
        ? "Conexión verificada con ARCA. Elegí un punto para emitir la prueba."
        : "Conexión verificada. Homologación no devolvió un listado de puntos. Podés indicar un número exclusivamente para la prueba: se consulta su numeración antes de enviar. Esto no da de alta un punto de venta real.",
    };
  }
}
