import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type { FiscalTrial } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import { fiscalReadiness } from "../organizations/fiscal-readiness";
import {
  ArcaConnectionService,
  authXml,
  type ArcaAccess,
} from "./arca-connection.service";
import { ArcaSoap, arcaMessages, obj, str } from "./arca-soap";

export function argentinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join("");
}
export function trialBody(
  trial: Pick<
    FiscalTrial,
    "point" | "voucherType" | "number" | "date" | "totalMinor"
  > &
    Partial<Pick<FiscalTrial, "docType" | "docNumber" | "saleSnapshot">>,
) {
  return `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${trial.point}</PtoVta><CbteTipo>${trial.voucherType}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>${trial.docType ?? 99}</DocTipo><DocNro>${trial.docNumber ?? "0"}</DocNro><CbteDesde>${trial.number}</CbteDesde><CbteHasta>${trial.number}</CbteHasta><CbteFch>${trial.date}</CbteFch><ImpTotal>${(trial.totalMinor / 100).toFixed(2)}</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>${trial.voucherType === 11 ? (trial.totalMinor / 100).toFixed(2) : "100.00"}</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>${trial.voucherType === 6 ? "21.00" : "0.00"}</ImpIVA><MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>${Number(obj(obj(trial.saleSnapshot).recipient).vatId) || 5}</CondicionIVAReceptorId>${trial.voucherType === 6 ? "<Iva><AlicIva><Id>5</Id><BaseImp>100.00</BaseImp><Importe>21.00</Importe></AlicIva></Iva>" : ""}</FECAEDetRequest></FeDetReq></FeCAEReq>`;
}
export function matchesTrial(
  result: Record<string, unknown>,
  trial: FiscalTrial,
) {
  return (
    Number(str(result.CbteDesde)) === trial.number &&
    Number(str(result.CbteHasta)) === trial.number &&
    Number(str(result.PtoVta)) === trial.point &&
    Number(str(result.CbteTipo)) === trial.voucherType &&
    str(result.CbteFch) === trial.date &&
    Math.round(Number(str(result.ImpTotal)) * 100) === trial.totalMinor &&
    str(result.DocTipo) === String(trial.docType) &&
    str(result.DocNro) === trial.docNumber &&
    str(result.Concepto) === "1" &&
    str(result.MonId) === "PES"
  );
}
@Injectable()
export class FiscalTrialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly connection: ArcaConnectionService,
    private readonly soap: ArcaSoap,
  ) {}
  async history(actor: string, org: string) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    return this.prisma.fiscalTrial.findMany({
      where: { organizationId: org, sourceSaleId: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }
  async issue(actor: string, org: string, requestId: string, point: number) {
    await this.organizations.authorizeFiscalManagement(actor, org);
    if (!Number.isInteger(point) || point < 1 || point > 99999)
      throw new BadRequestException("Elegí un punto de venta válido.");
    const existing = await this.prisma.fiscalTrial.findUnique({
      where: { organizationId_requestId: { organizationId: org, requestId } },
    });
    if (existing) {
      if (existing.point !== point)
        throw new ConflictException("La solicitud ya pertenece a otro punto.");
      return existing;
    }
    const access = await this.connection.access(actor, org);
    const points = await this.connection.points(access);
    // Homologation may return 602 (no catalog). Explicit sandbox point then
    // gets checked through FECompUltimoAutorizado; never applies to production.
    if (points.length > 0 && !points.some((p) => p.number === point))
      throw new BadRequestException(
        "ARCA no habilita este punto para CAE en homologación.",
      );
    const trial = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fiscal-trial:${org}`},0))`;
      const repeat = await tx.fiscalTrial.findUnique({
        where: { organizationId_requestId: { organizationId: org, requestId } },
      });
      if (repeat)
        throw new ConflictException(
          "La solicitud ya está procesándose. Consultá el historial.",
        );
      if (
        await tx.fiscalTrial.findFirst({
          where: {
            organizationId: org,
            status: { in: ["PENDING", "UNCERTAIN"] },
          },
        })
      )
        throw new ConflictException(
          "Hay una prueba pendiente. Consultá su resultado antes de emitir otra.",
        );
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: org },
      });
      if (!fiscalReadiness(organization.fiscalProfile, 1).checks[0]?.ready)
        throw new BadRequestException(
          "Completá los datos fiscales antes de la prueba.",
        );
      const profile = readFiscalProfile(organization.fiscalProfile);
      if (profile.cuit !== access.cuit)
        throw new ConflictException(
          "Cambió el CUIT durante la conexión. Volvé a conectar.",
        );
      const type = profile.vatCondition === "REGISTERED" ? 6 : 11;
      const created = await tx.fiscalTrial.create({
        data: {
          organizationId: org,
          requestId,
          point,
          voucherType: type,
          date: argentinaDate(),
          totalMinor: type === 6 ? 12100 : 10000,
          issuer: { ...profile },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org,
          actorId: actor,
          entityType: "FISCAL_TRIAL",
          entityId: created.id,
          action: "REQUESTED",
          after: { environment: "HOMOLOGATION", point },
        },
      });
      return created;
    });
    return this.sendPrepared(actor, trial, access);
  }
  async sendPrepared(actor: string, trial: FiscalTrial, access: ArcaAccess) {
    const point = trial.point;
    let numbered: FiscalTrial = trial;
    try {
      const last = await this.soap.call(
        "wsfe",
        "FECompUltimoAutorizado",
        `${authXml(access)}<PtoVta>${point}</PtoVta><CbteTipo>${trial.voucherType}</CbteTipo>`,
      );
      if (arcaMessages(last)) throw new BadRequestException(arcaMessages(last));
      const number = Number(str(last.CbteNro));
      if (
        !/^\d+$/.test(str(last.CbteNro)) ||
        !Number.isSafeInteger(number) ||
        number < 0 ||
        number >= 99999999
      )
        throw new BadRequestException(
          "ARCA no devolvió una numeración válida.",
        );
      numbered = await this.prisma.fiscalTrial.update({
        where: { id: trial.id },
        data: { number: number + 1 },
      });
      const response = await this.soap.call(
        "wsfe",
        "FECAESolicitar",
        authXml(access) + trialBody(numbered),
      );
      const detail = obj(obj(response.FeDetResp).FECAEDetResponse);
      if (
        str(detail.Resultado) === "A" &&
        Number(str(detail.CbteDesde)) === numbered.number &&
        Number(str(obj(response.FeCabResp).PtoVta)) === point &&
        /^\d{14}$/.test(str(detail.CAE)) &&
        /^\d{8}$/.test(str(detail.CAEFchVto))
      )
        return this.finish(
          actor,
          numbered,
          "AUTHORIZED",
          arcaMessages(detail),
          str(detail.CAE),
          str(detail.CAEFchVto),
        );
      if (
        str(detail.Resultado) === "R" ||
        str(obj(response.FeCabResp).Resultado) === "R"
      )
        return this.finish(
          actor,
          numbered,
          "REJECTED",
          arcaMessages(response) ||
            arcaMessages(detail) ||
            "ARCA rechazó la prueba.",
        );
      return this.finish(
        actor,
        numbered,
        "UNCERTAIN",
        "No se confirmó el resultado. Consultá ARCA antes de intentar otra prueba.",
      );
    } catch (error) {
      return this.finish(
        actor,
        numbered,
        numbered.number ? "UNCERTAIN" : "REJECTED",
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "No se pudo completar la prueba.",
      );
    }
  }
  private async finish(
    actor: string,
    trial: FiscalTrial,
    status: string,
    detail: string,
    cae?: string,
    caeExpires?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.fiscalTrial.updateMany({
        where: { id: trial.id, status: { in: ["PENDING", "UNCERTAIN"] } },
        data: { status, detail, cae, caeExpires },
      });
      const updated = await tx.fiscalTrial.findUniqueOrThrow({
        where: { id: trial.id },
      });
      if (!changed.count) return updated;
      await tx.auditLog.create({
        data: {
          organizationId: trial.organizationId,
          actorId: actor,
          entityType: "FISCAL_TRIAL",
          entityId: trial.id,
          action: status,
          after: {
            environment: "HOMOLOGATION",
            number: trial.number,
            cae: cae ?? null,
          },
        },
      });
      return updated;
    });
  }
  async reconcile(actor: string, org: string, id: string, saleId?: string) {
    if (saleId) await this.organizations.authorizeFiscalSale(actor, org);
    else await this.organizations.authorizeFiscalManagement(actor, org);
    const trial = await this.prisma.fiscalTrial.findFirst({
      where: {
        id,
        organizationId: org,
        ...(saleId ? { sourceSaleId: saleId } : {}),
      },
    });
    if (!trial) throw new BadRequestException("No se encontró la prueba.");
    if (["AUTHORIZED", "REJECTED"].includes(trial.status)) return trial;
    if (
      trial.status === "PENDING" &&
      Date.now() - trial.updatedAt.getTime() < 120000
    )
      throw new ConflictException(
        "La solicitud puede seguir procesándose. Esperá dos minutos antes de consultar.",
      );
    if (trial.status === "QUEUED")
      throw new BadRequestException(
        "La factura todavía no se envió. Procesala desde Ventas.",
      );
    if (!trial.number)
      return this.finish(
        actor,
        trial,
        "REJECTED",
        "La preparación se interrumpió antes de reservar numeración; no se envió a ARCA.",
      );
    const access = await this.connection.access(
      actor,
      org,
      saleId ? "sale" : "setup",
    );
    if (access.cuit !== readFiscalProfile(trial.issuer).cuit)
      throw new ConflictException(
        "La prueba pertenece a otro CUIT. Restaurá su configuración para consultar.",
      );
    const response = await this.soap.call(
      "wsfe",
      "FECompConsultar",
      `${authXml(access)}<FeCompConsReq><CbteTipo>${trial.voucherType}</CbteTipo><CbteNro>${trial.number}</CbteNro><PtoVta>${trial.point}</PtoVta></FeCompConsReq>`,
    );
    const result = obj(response.ResultGet);
    if (
      str(result.Resultado) === "A" &&
      matchesTrial(result, trial) &&
      /^\d{14}$/.test(str(result.CodAutorizacion)) &&
      /^\d{8}$/.test(str(result.FchVto))
    )
      return this.finish(
        actor,
        trial,
        "AUTHORIZED",
        "Resultado recuperado de ARCA.",
        str(result.CodAutorizacion),
        str(result.FchVto),
      );
    return this.finish(
      actor,
      trial,
      "UNCERTAIN",
      arcaMessages(response) ||
        "ARCA no confirmó una coincidencia. No se reenvía ni se libera la numeración automáticamente; requiere revisión.",
    );
  }
}
