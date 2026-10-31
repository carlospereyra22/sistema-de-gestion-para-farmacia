import {
  Injectable,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import type { FiscalDocument, Prisma } from "@prisma/client";
import type { SaleFiscalOptions } from "@gestion/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { organizationTicketStore } from "../organizations/ticket-header";
import { ArcaConnectionService, authXml } from "./arca-connection.service";
import { ArcaSoap, arcaMessages, obj, str } from "./arca-soap";
import { argentinaDate } from "./fiscal-trial.service";
import { ProductionConfigurationService } from "./production-configuration.service";
import { saleFiscalRecipient } from "./sale-fiscal-options";
import {
  assertProductionIssuance,
  productionBody,
  authorizedProductionResponse,
  matchesProduction,
} from "./production-document";
import { fiscalQrUrl } from "./fiscal-qr";

@Injectable()
export class ProductionSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurations: ProductionConfigurationService,
    private readonly connection: ArcaConnectionService,
    private readonly soap: ArcaSoap,
    private readonly organizations: OrganizationsService,
  ) {}
  async enqueue(
    tx: Prisma.TransactionClient,
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    customerId: string | undefined,
    total: bigint,
    items: {
      productId: string | null;
      description?: string | null;
      quantity: number;
      unitPriceMinor: bigint;
      discountMinor: bigint;
    }[],
    options?: SaleFiscalOptions,
  ) {
    const { organization, profile, configuration } =
      await this.configurations.validate(tx, org, branch);
    if (total <= 0n || total > 2147483647n)
      throw new BadRequestException(
        "El total excede el rango implementado para facturación (hasta $21.474.836,47).",
      );
    const customer = customerId
      ? await tx.customer.findFirstOrThrow({
          where: { id: customerId, organizationId: org, active: true },
        })
      : null;
    const recipient = saleFiscalRecipient(
      customer,
      options ?? { recipient: "FINAL_CONSUMER", voucherType: 11 },
    );
    if (total >= 1000000000n && recipient.docType === 99)
      throw new BadRequestException(
        "Identificá al consumidor final con DNI o CUIT para ventas de $10.000.000 o más.",
      );
    const branchRecord = await tx.branch.findFirstOrThrow({
      where: { id: branch, organizationId: org, active: true },
    });
    const cashier = await tx.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actor, organizationId: org } },
      select: { displayName: true },
    });
    const products = await tx.product.findMany({
      where: {
        organizationId: org,
        id: {
          in: items.flatMap((item) => (item.productId ? [item.productId] : [])),
        },
      },
      select: { id: true, name: true },
    });
    const document = await tx.fiscalDocument.create({
      data: {
        organizationId: org,
        branchId: branch,
        sourceSaleId: saleId,
        requestId: saleId,
        kind: "INVOICE",
        environment: "PRODUCTION",
        status: "QUEUED",
        issuerCuit: profile.cuit,
        point: configuration.point,
        voucherType: 11,
        date: argentinaDate(),
        totalMinor: Number(total),
        docType: recipient.docType,
        docNumber: recipient.docNumber,
        recipientVatId: recipient.vatId,
        issuer: { ...profile },
        saleSnapshot: {
          store: { ...organizationTicketStore(organization) },
          branchName: branchRecord.name,
          branchId: branch,
          cashier: cashier?.displayName ?? "",
          recipient,
          items: items.map((item) => ({
            productId: item.productId,
            name:
              item.description ??
              products.find((p) => p.id === item.productId)?.name ??
              item.productId ??
              "Concepto",
            quantity: item.quantity,
            unitPriceMinor: String(item.unitPriceMinor),
            discountMinor: String(item.discountMinor),
            amountMinor: String(
              item.unitPriceMinor * BigInt(item.quantity) - item.discountMinor,
            ),
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: org,
        branchId: branch,
        actorId: actor,
        entityType: "FISCAL_DOCUMENT",
        entityId: document.id,
        action: "SALE_QUEUED",
        after: {
          saleId,
          environment: "PRODUCTION",
          point: document.point,
          totalMinor: String(total),
        },
      },
    });
  }
  present(document: FiscalDocument) {
    const qrUrl =
      document.status === "AUTHORIZED" && document.cae && document.number
        ? fiscalQrUrl({
            environment: document.environment,
            status: document.status,
            date: `${document.date.slice(0, 4)}-${document.date.slice(4, 6)}-${document.date.slice(6, 8)}`,
            issuerCuit: document.issuerCuit,
            point: document.point,
            voucherType: document.voucherType,
            number: document.number,
            totalMinor: BigInt(document.totalMinor),
            currency: "PES",
            cae: document.cae,
            recipient: {
              docType: document.docType,
              docNumber: document.docNumber,
            },
          })
        : null;
    return { ...document, qrUrl };
  }
  async process(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    documentId?: string,
  ) {
    await this.organizations.authorizeFiscalSale(actor, org);
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: {
        organizationId: org,
        branchId: branch,
        sourceSaleId: saleId,
        ...(documentId ? { id: documentId } : { kind: "INVOICE" }),
      },
    });
    if (!doc)
      throw new BadRequestException("Comprobante productivo no encontrado.");
    if (["AUTHORIZED", "REJECTED"].includes(doc.status))
      return this.present(doc);
    if (doc.status !== "QUEUED")
      return this.present(await this.reconcile(actor, doc));
    assertProductionIssuance();
    try {
      await this.configurations.validate(this.prisma, org, branch);
      const access = await this.connection.access(
        actor,
        org,
        "sale",
        "PRODUCTION",
      );
      if (access.environment !== "PRODUCTION" || access.cuit !== doc.issuerCuit)
        throw new ConflictException(
          "El acceso no corresponde al emisor productivo del documento.",
        );
      const points = await this.connection.points(access);
      if (!points.some((p) => p.number === doc.point))
        throw new BadRequestException(
          "El punto de la venta no está habilitado por ARCA para CAE.",
        );
      const reserved = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fiscal-production:${doc.issuerCuit}:${doc.point}`},0))`;
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${saleId}::uuid FOR UPDATE`;
        const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
        if (sale.status !== "COMPLETED")
          throw new BadRequestException(
            "La venta ya no está disponible para emitir.",
          );
        await this.configurations.validate(tx, org, branch);
        const current = await tx.fiscalDocument.findUniqueOrThrow({
          where: { id: doc.id },
        });
        if (current.status !== "QUEUED") return null;
        if (
          await tx.fiscalDocument.findFirst({
            where: {
              issuerCuit: doc.issuerCuit,
              point: doc.point,
              status: { in: ["PENDING", "UNCERTAIN"] },
            },
          })
        )
          throw new ConflictException(
            "Hay un comprobante sin confirmar en este punto. Consultá su resultado antes de emitir otro.",
          );
        return tx.fiscalDocument.update({
          where: { id: doc.id },
          data: { status: "PENDING", date: argentinaDate(), detail: null },
        });
      });
      if (!reserved)
        return this.present(
          await this.prisma.fiscalDocument.findUniqueOrThrow({
            where: { id: doc.id },
          }),
        );
      let numbered = reserved;
      try {
        const last = await this.soap.call(
          "wsfe",
          "FECompUltimoAutorizado",
          `${authXml(access)}<PtoVta>${doc.point}</PtoVta><CbteTipo>${doc.voucherType}</CbteTipo>`,
          "PRODUCTION",
        );
        const number = Number(str(last.CbteNro));
        if (
          arcaMessages(last) ||
          !/^\d+$/.test(str(last.CbteNro)) ||
          !Number.isSafeInteger(number) ||
          number < 0 ||
          number >= 99999999 ||
          Number(str(last.PtoVta)) !== doc.point ||
          Number(str(last.CbteTipo)) !== doc.voucherType
        )
          throw new BadRequestException(
            "ARCA no devolvió una numeración coincidente y válida.",
          );
        numbered = await this.prisma.fiscalDocument.update({
          where: { id: doc.id },
          data: { number: number + 1 },
        });
        const original = numbered.originalId
          ? await this.prisma.fiscalDocument.findUnique({
              where: { id: numbered.originalId },
            })
          : null;
        const response = await this.soap.call(
          "wsfe",
          "FECAESolicitar",
          authXml(access) + productionBody(numbered, original),
          "PRODUCTION",
        );
        const detail = obj(obj(response.FeDetResp).FECAEDetResponse);
        if (authorizedProductionResponse(response, numbered))
          return this.present(
            await this.finish(
              actor,
              numbered,
              "AUTHORIZED",
              arcaMessages(detail),
              str(detail.CAE),
              str(detail.CAEFchVto),
            ),
          );
        // Only an explicit rejection releases the point. Malformed/unknown responses never do.
        const header = obj(response.FeCabResp);
        if (
          str(header.Resultado) === "R" &&
          Number(str(header.Cuit)) === Number(doc.issuerCuit) &&
          str(header.CantReg) === "1" &&
          Number(str(header.PtoVta)) === doc.point &&
          Number(str(header.CbteTipo)) === doc.voucherType &&
          str(detail.Resultado) === "R" &&
          str(detail.CbteFch) === numbered.date &&
          Number(str(detail.DocTipo)) === numbered.docType &&
          str(detail.DocNro) === numbered.docNumber &&
          Number(str(detail.CbteDesde)) === numbered.number &&
          Number(str(detail.CbteHasta)) === numbered.number
        )
          return this.present(
            await this.finish(
              actor,
              numbered,
              "REJECTED",
              arcaMessages(response) ||
                arcaMessages(detail) ||
                "ARCA rechazó el comprobante. La venta permanece registrada.",
            ),
          );
        return this.present(
          await this.finish(
            actor,
            numbered,
            "UNCERTAIN",
            "Respuesta no confirmada. Consultá el resultado; no repitas la venta.",
          ),
        );
      } catch {
        return this.present(
          await this.finish(
            actor,
            numbered,
            numbered.number ? "UNCERTAIN" : "REJECTED",
            numbered.number
              ? "Se interrumpió el envío o su confirmación. Sólo se permite consultar ARCA; no se reenvía."
              : "Se interrumpió la preparación antes de asignar número. No se envió el comprobante.",
          ),
        );
      }
    } catch (error) {
      await this.prisma.fiscalDocument.updateMany({
        where: { id: doc.id, status: "QUEUED" },
        data: {
          detail:
            error instanceof BadRequestException ||
            error instanceof ConflictException
              ? error.message.slice(0, 1000)
              : "No se pudo preparar el envío. La venta ya está registrada; no la repitas.",
        },
      });
      return this.present(
        await this.prisma.fiscalDocument.findUniqueOrThrow({
          where: { id: doc.id },
        }),
      );
    }
  }
  private async finish(
    actor: string,
    doc: FiscalDocument,
    status: string,
    detail: string,
    cae?: string,
    caeExpires?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.fiscalDocument.updateMany({
        where: {
          id: doc.id,
          status: { in: ["PENDING", "UNCERTAIN"] },
          number: doc.number,
        },
        data: { status, detail, cae, caeExpires },
      });
      if (changed.count)
        await tx.auditLog.create({
          data: {
            organizationId: doc.organizationId,
            branchId: doc.branchId,
            actorId: actor,
            entityType: "FISCAL_DOCUMENT",
            entityId: doc.id,
            action: status,
            after: {
              environment: "PRODUCTION",
              point: doc.point,
              voucherType: doc.voucherType,
              number: doc.number,
              cae: cae ?? null,
            },
          },
        });
      return tx.fiscalDocument.findUniqueOrThrow({ where: { id: doc.id } });
    });
  }
  private async reconcile(actor: string, doc: FiscalDocument) {
    if (
      Date.now() - doc.updatedAt.getTime() < 120000 &&
      doc.status === "PENDING"
    )
      throw new ConflictException(
        "La solicitud puede seguir en curso. Esperá dos minutos antes de consultar.",
      );
    if (!doc.number)
      return this.finish(
        actor,
        doc,
        "REJECTED",
        "La preparación se interrumpió antes de reservar número; no se envió a ARCA.",
      );
    // Reconciliation remains available when new issuance is disabled.
    const access = await this.connection.access(
      actor,
      doc.organizationId,
      "sale",
      "PRODUCTION",
    );
    if (access.environment !== "PRODUCTION" || access.cuit !== doc.issuerCuit)
      throw new ConflictException(
        "Restaurá el acceso del emisor original para consultar este documento.",
      );
    const response = await this.soap.call(
      "wsfe",
      "FECompConsultar",
      `${authXml(access)}<FeCompConsReq><CbteTipo>${doc.voucherType}</CbteTipo><CbteNro>${doc.number}</CbteNro><PtoVta>${doc.point}</PtoVta></FeCompConsReq>`,
      "PRODUCTION",
    );
    const result = obj(response.ResultGet);
    const original = doc.originalId
      ? await this.prisma.fiscalDocument.findUnique({
          where: { id: doc.originalId },
        })
      : null;
    if (matchesProduction(result, doc, original))
      return this.finish(
        actor,
        doc,
        "AUTHORIZED",
        "Autorización recuperada de ARCA.",
        str(result.CodAutorizacion),
        str(result.FchVto),
      );
    return this.finish(
      actor,
      doc,
      "UNCERTAIN",
      "ARCA no confirmó una coincidencia exacta. El número sigue reservado; requiere revisión, no otra venta.",
    );
  }
}
