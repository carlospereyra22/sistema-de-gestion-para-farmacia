import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma, type FiscalTrial } from "@prisma/client";
import type { SaleFiscalOptions } from "@gestion/contracts";
import { saleFiscalRecipient } from "./sale-fiscal-options";
import { PrismaService } from "../prisma/prisma.service";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import { fiscalReadiness } from "../organizations/fiscal-readiness";
import { ArcaConnectionService } from "./arca-connection.service";
import { argentinaDate, FiscalTrialService } from "./fiscal-trial.service";
import { organizationTicketStore } from "../organizations/ticket-header";
import type { FiscalActor } from "./actor-fiscal";
import { estadoInicial, type FacturaDiferida } from "./factura-diferida";
import { obj } from "./arca-soap";

/** Datos de una nota de crédito fiscal, armados por la devolución (SISTEMA-110). */
export type NotaFiscal = {
  requestId: string;
  customerReturnId: string;
  reason: string;
  totalMinor: bigint;
  items: {
    saleItemId: string;
    productId: string | null;
    name: string;
    quantity: number;
    unitPriceMinor: string;
    discountMinor: string;
    amountMinor: string;
  }[];
};

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
    /** Factura que no sale en el momento de la venta (SISTEMA-65). */
    diferida?: FacturaDiferida,
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
      where: {
        userId_organizationId: {
          userId: diferida?.cajeroId ?? actor,
          organizationId: org,
        },
      },
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
        status: estadoInicial(diferida),
        deferredReason: diferida?.motivo ?? null,
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
        action: diferida?.enEspera ? "SALE_HELD" : "SALE_QUEUED",
        after: {
          saleId,
          environment: "HOMOLOGATION",
          totalMinor: total.toString(),
          ...(diferida ? { deferredReason: diferida.motivo } : {}),
        },
      },
    });
  }
  requeue(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    creditId?: string,
  ) {
    return this.trials.requeue(actor, org, branch, saleId, creditId);
  }
  /**
   * Nota de crédito C de prueba (SISTEMA-110): queda en cola dentro de la
   * transacción de la devolución. Requiere la factura de prueba autorizada.
   */
  async enqueueCredit(
    tx: Prisma.TransactionClient,
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    nota: NotaFiscal,
  ) {
    const original = await tx.fiscalTrial.findFirst({
      where: { organizationId: org, sourceSaleId: saleId, kind: "INVOICE" },
    });
    if (!original || original.status !== "AUTHORIZED" || !original.number)
      throw new BadRequestException(
        "La factura de prueba de la venta todavía no está autorizada por ARCA. Esperá a que se autorice para hacer la nota de crédito.",
      );
    const previas = await tx.fiscalTrial.aggregate({
      where: { organizationId: org, creditSaleId: saleId, kind: "CREDIT_NOTE" },
      _sum: { totalMinor: true },
    });
    if (
      nota.totalMinor <= 0n ||
      nota.totalMinor + BigInt(previas._sum.totalMinor ?? 0) >
        BigInt(original.totalMinor)
    )
      throw new BadRequestException(
        "La nota de crédito supera lo que queda de la factura.",
      );
    const snapshot = obj(original.saleSnapshot);
    const created = await tx.fiscalTrial.create({
      data: {
        organizationId: org,
        requestId: nota.requestId,
        kind: "CREDIT_NOTE",
        originalId: original.id,
        creditSaleId: saleId,
        customerReturnId: nota.customerReturnId,
        reason: nota.reason,
        status: "QUEUED",
        point: original.point,
        voucherType: 13,
        date: argentinaDate(),
        totalMinor: Number(nota.totalMinor),
        issuer: original.issuer as Prisma.InputJsonValue,
        docType: original.docType,
        docNumber: original.docNumber,
        saleSnapshot: {
          ...snapshot,
          items: nota.items,
          originalNumber: `${String(original.point).padStart(5, "0")}-${String(original.number).padStart(8, "0")}`,
        } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: org,
        branchId: branch,
        actorId: actor,
        entityType: "FISCAL_TRIAL",
        entityId: created.id,
        action: "CREDIT_QUEUED",
        after: {
          saleId,
          originalId: original.id,
          customerReturnId: nota.customerReturnId,
          environment: "HOMOLOGATION",
          totalMinor: nota.totalMinor.toString(),
        },
      },
    });
    return created;
  }
  /** Envía (o concilia) una nota de crédito de prueba de la venta. */
  async processCredit(
    actor: FiscalActor,
    org: string,
    branch: string,
    saleId: string,
    creditId: string,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId: org, branchId: branch },
    });
    const current = await this.prisma.fiscalTrial.findFirst({
      where: {
        id: creditId,
        organizationId: org,
        creditSaleId: saleId,
        kind: "CREDIT_NOTE",
      },
    });
    if (!sale || !current)
      throw new BadRequestException(
        "No se encontró la nota de crédito de prueba.",
      );
    if (current.status !== "QUEUED")
      return this.trials.reconcile(actor, org, current.id, sale.id);
    return this.enviar(actor, org, sale.id, current);
  }
  async process(
    actor: FiscalActor,
    org: string,
    branch: string,
    saleId: string,
  ) {
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
    // En espera de caja: no se envía ni se consulta en ARCA.
    if (current.status === "HELD") return current;
    if (current.status !== "QUEUED")
      return this.trials.reconcile(actor, org, current.id, sale.id);
    return this.enviar(actor, org, sale.id, current);
  }
  /** Reserva el número y manda a ARCA una factura o nota de prueba en cola. */
  private async enviar(
    actor: FiscalActor,
    org: string,
    saleId: string,
    current: FiscalTrial,
  ) {
    const sale = { id: saleId };
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
