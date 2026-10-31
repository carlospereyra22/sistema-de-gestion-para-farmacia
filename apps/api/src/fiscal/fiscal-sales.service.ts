import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { SaleFiscalOptions } from "@gestion/contracts";
import { saleFiscalRecipient } from "./sale-fiscal-options";
import { PrismaService } from "../prisma/prisma.service";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import { fiscalReadiness } from "../organizations/fiscal-readiness";
import { ArcaConnectionService } from "./arca-connection.service";
import { argentinaDate, FiscalTrialService } from "./fiscal-trial.service";
import { organizationTicketStore } from "../organizations/ticket-header";

export { fiscalRecipient } from "./fiscal-recipient";

@Injectable()
export class FiscalSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connection: ArcaConnectionService,
    private readonly trials: FiscalTrialService,
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
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const profile = readFiscalProfile(organization.fiscalProfile);
    if (!fiscalReadiness(profile, 1).checks[0]?.ready)
      throw new BadRequestException(
        "Completá el perfil fiscal antes de registrar una venta con factura.",
      );
    if (!["MONOTAX", "EXEMPT"].includes(profile.vatCondition))
      throw new BadRequestException(
        "Ventas en homologación admite factura C para monotributo/exento. Otros emisores requieren configurar impuestos por producto; no se aplica un IVA supuesto.",
      );
    const points = await tx.fiscalPoint.findMany({
      where: {
        organizationId: org,
        branchId: branch,
        environment: "HOMOLOGATION",
        active: true,
      },
    });
    if (points.length !== 1)
      throw new BadRequestException(
        "Asociá un único punto de homologación activo a esta sucursal en Organización → Facturación.",
      );
    const credential = await tx.fiscalCredential.findUnique({
      where: {
        organizationId_environment: {
          organizationId: org,
          environment: "HOMOLOGATION",
        },
      },
      select: { certificate: true, expiresAt: true, representedCuit: true },
    });
    if (
      !credential?.certificate ||
      !credential.expiresAt ||
      credential.expiresAt.getTime() <= Date.now() ||
      credential.representedCuit !== profile.cuit
    )
      throw new BadRequestException(
        "Cargá un certificado vigente para el CUIT de la organización.",
      );
    if (total <= 0n || total > 2147483647n)
      throw new BadRequestException(
        "El total queda fuera del rango admitido por la prueba de facturación.",
      );
    const customer = customerId
      ? await tx.customer.findFirstOrThrow({
          where: { id: customerId, organizationId: org, active: true },
        })
      : null;
    const recipient = saleFiscalRecipient(customer, options);
    const branchRecord = await tx.branch.findFirstOrThrow({
      where: { id: branch, organizationId: org },
    });
    const cashier = await tx.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actor, organizationId: org } },
      select: { displayName: true },
    });
    const products = await tx.product.findMany({
      where: {
        organizationId: org,
        id: { in: items.flatMap((i) => (i.productId ? [i.productId] : [])) },
      },
      select: { id: true, name: true },
    });
    const trial = await tx.fiscalTrial.create({
      data: {
        organizationId: org,
        sourceSaleId: saleId,
        requestId: saleId,
        status: "QUEUED",
        point: points[0]!.number,
        voucherType: 11,
        date: argentinaDate(),
        totalMinor: Number(total),
        issuer: { ...profile },
        docType: recipient.docType,
        docNumber: recipient.docNumber,
        saleSnapshot: {
          store: { ...organizationTicketStore(organization) },
          branchName: branchRecord.name,
          cashier: cashier?.displayName ?? "",
          recipient,
          branchId: branch,
          items: items.map((i) => ({
            name:
              i.description ??
              products.find((p) => p.id === i.productId)?.name ??
              i.productId ??
              "Concepto",
            quantity: i.quantity,
            unitPriceMinor: i.unitPriceMinor.toString(),
            discountMinor: i.discountMinor.toString(),
            amountMinor: (
              i.unitPriceMinor * BigInt(i.quantity) -
              i.discountMinor
            ).toString(),
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: org,
        branchId: branch,
        actorId: actor,
        entityType: "FISCAL_TRIAL",
        entityId: trial.id,
        action: "SALE_QUEUED",
        after: {
          saleId,
          environment: "HOMOLOGATION",
          totalMinor: total.toString(),
        },
      },
    });
  }
  async process(actor: string, org: string, branch: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId: org, branchId: branch },
      include: { fiscalTrial: true },
    });
    if (!sale?.fiscalTrial)
      throw new BadRequestException(
        "La venta no tiene una factura de homologación.",
      );
    if (sale.status !== "COMPLETED")
      throw new BadRequestException(
        "La venta está anulada; no se envía una factura nueva.",
      );
    const current = sale.fiscalTrial;
    if (current.status !== "QUEUED")
      return this.trials.reconcile(actor, org, current.id, sale.id);
    try {
      const access = await this.connection.access(actor, org, "sale");
      if (access.cuit !== readFiscalProfile(current.issuer).cuit)
        throw new ConflictException(
          "Cambió el CUIT del emisor. La factura conserva los datos de la venta original.",
        );
      const points = await this.connection.points(access);
      if (points.length && !points.some((p) => p.number === current.point))
        throw new BadRequestException(
          "El punto de la venta no está habilitado por ARCA para CAE.",
        );
      const reserved = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fiscal-trial:${org}`},0))`;
        // Cancellation and reservation are serialized on this sale as well.
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id}::uuid FOR UPDATE`;
        const latest = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
        });
        if (latest.status !== "COMPLETED")
          throw new BadRequestException("La venta fue anulada.");
        if (
          await tx.fiscalTrial.findFirst({
            where: {
              organizationId: org,
              status: { in: ["PENDING", "UNCERTAIN"] },
            },
          })
        )
          throw new ConflictException(
            "Hay otra factura pendiente de confirmar. Consultá su resultado antes de enviar ésta.",
          );
        const changed = await tx.fiscalTrial.updateMany({
          where: { id: current.id, status: "QUEUED" },
          data: { status: "PENDING", date: argentinaDate(), detail: null },
        });
        if (!changed.count) return null;
        return tx.fiscalTrial.findUniqueOrThrow({ where: { id: current.id } });
      });
      if (reserved)
        return await this.trials.sendPrepared(actor, reserved, access);
    } catch (error) {
      await this.prisma.fiscalTrial.updateMany({
        where: { id: current.id, status: "QUEUED" },
        data: {
          detail:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "No se pudo conectar. La venta ya está registrada; no la repitas.",
        },
      });
    }
    return this.prisma.fiscalTrial.findUniqueOrThrow({
      where: { id: current.id },
    });
  }
}
