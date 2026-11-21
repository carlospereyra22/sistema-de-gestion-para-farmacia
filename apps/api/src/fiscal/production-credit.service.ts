import { Injectable, BadRequestException } from "@nestjs/common";
import { lockCashSession } from "../cash/lock-cash-session";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { ProductionConfigurationService } from "./production-configuration.service";
import { argentinaDate } from "./fiscal-trial.service";
import { obj, list, str } from "./arca-soap";
import type { NotaFiscal } from "./fiscal-sales.service";
import { AccountsService } from "../accounts/accounts.service";

@Injectable()
export class ProductionCreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurations: ProductionConfigurationService,
    private readonly organizations: OrganizationsService,
    private readonly accounts: AccountsService,
  ) {}
  private async settlementPreview(
    tx: Prisma.TransactionClient,
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    documentId: string,
  ) {
    const document = await tx.fiscalDocument.findFirstOrThrow({
      where: {
        id: documentId,
        organizationId: org,
        branchId: branch,
        sourceSaleId: saleId,
        kind: "CREDIT_NOTE",
        status: "AUTHORIZED",
      },
    });
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { payments: true },
    });
    const lines = list(obj(document.saleSnapshot).items).map(obj);
    const allocations: { saleItemId: string; amountMinor: number }[] = [];
    if (sale.customerId && sale.payments.some((p) => p.method === "ACCOUNT")) {
      const balances = await this.accounts.itemBalances(
        tx,
        actor,
        org,
        sale.customerId,
      );
      if (
        balances.unassignedReceipts.length ||
        balances.mixedSales.some((s) => s.saleId === saleId)
      )
        throw new BadRequestException(
          "Conciliá los cobros y la financiación por artículo en Cuenta corriente antes de liquidar esta nota.",
        );
      for (const line of lines) {
        const balance = balances.items.find(
          (i) => i.saleItemId === str(line.saleItemId),
        );
        if (!balance)
          throw new BadRequestException(
            "No se encontró el saldo del artículo financiado.",
          );
        const credit = Math.min(
          Number(balance.pendingMinor),
          Number(str(line.amountMinor)),
        );
        if (credit > 0)
          allocations.push({
            saleItemId: str(line.saleItemId),
            amountMinor: credit,
          });
      }
    }
    const accountMinor = allocations.reduce(
      (n, item) => n + item.amountMinor,
      0,
    );
    return {
      document,
      sale,
      allocations,
      accountMinor,
      refundMinor: document.totalMinor - accountMinor,
    };
  }
  async previewSettlement(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    documentId: string,
  ) {
    await this.organizations.authorizeFiscalSale(actor, org);
    const value = await this.prisma.$transaction(
      (tx) =>
        this.settlementPreview(tx, actor, org, branch, saleId, documentId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      accountMinor: value.accountMinor,
      refundMinor: value.refundMinor,
      settledAt: value.document.settledAt,
    };
  }
  async settle(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    documentId: string,
    input: {
      expectedAccountMinor: number;
      expectedRefundMinor: number;
      method: "CASH" | "CARD" | "TRANSFER";
      cashSessionId?: string;
      reference: string;
      received: boolean;
      confirm: boolean;
    },
  ) {
    await this.organizations.authorizeFiscalSale(actor, org);
    if (
      !input.confirm ||
      input.reference.trim().length < 3 ||
      !["CASH", "CARD", "TRANSFER"].includes(input.method)
    )
      throw new BadRequestException(
        "Confirmá la devolución efectiva y su referencia.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FiscalDocument" WHERE id=${documentId}::uuid AND "organizationId"=${org}::uuid FOR UPDATE`;
        const current = await tx.fiscalDocument.findFirstOrThrow({
          where: {
            id: documentId,
            organizationId: org,
            branchId: branch,
            sourceSaleId: saleId,
            kind: "CREDIT_NOTE",
            status: "AUTHORIZED",
          },
        });
        if (current.settledAt) return { settledAt: current.settledAt };
        const value = await this.settlementPreview(
          tx,
          actor,
          org,
          branch,
          saleId,
          documentId,
        );
        if (
          value.accountMinor !== input.expectedAccountMinor ||
          value.refundMinor !== input.expectedRefundMinor
        )
          throw new BadRequestException(
            "Los saldos cambiaron; revisá los importes antes de confirmar.",
          );
        if (value.refundMinor > 0 && input.method === "CASH") {
          if (input.cashSessionId)
            await lockCashSession(tx, input.cashSessionId);
          const session = input.cashSessionId
            ? await tx.cashSession.findFirst({
                where: { id: input.cashSessionId, closedAt: null },
              })
            : null;
          const register = session
            ? await tx.cashRegister.findFirst({
                where: {
                  id: session.cashRegisterId,
                  branchId: branch,
                  active: true,
                },
              })
            : null;
          if (!session || !register)
            throw new BadRequestException(
              "Seleccioná una caja abierta de esta sucursal.",
            );
          await tx.cashMovement.create({
            data: {
              cashSessionId: session.id,
              type: "OUT",
              amountMinor: BigInt(value.refundMinor),
              actorId: actor,
              reason: `Nota de crédito ${documentId}: ${input.reference.trim()}`,
            },
          });
        }
        if (value.accountMinor > 0 && value.sale.customerId)
          await tx.customerAccountMovement.create({
            data: {
              organizationId: org,
              branchId: branch,
              customerId: value.sale.customerId,
              type: "CREDIT",
              amountMinor: BigInt(value.accountMinor),
              actorId: actor,
              clientOperationId: documentId,
              allocations: value.allocations,
              note: `Crédito fiscal ${documentId}; no es un cobro de dinero.`,
            },
          });
        const physicalItems = list(obj(current.saleSnapshot).items).filter(
          (line) => Boolean(str(obj(line).productId)),
        );
        if (input.received && physicalItems.length)
          await tx.customerReturn.create({
            data: {
              organizationId: org,
              branchId: branch,
              saleId,
              actorId: actor,
              reason: `Nota de crédito ${documentId}`,
              items: {
                create: physicalItems.map((line) => ({
                  saleItemId: str(obj(line).saleItemId),
                  quantity: Number(obj(line).quantity),
                })),
              },
            },
          });
        const settlement = {
          accountMinor: value.accountMinor,
          refundMinor: value.refundMinor,
          method: input.method,
          cashSessionId: input.cashSessionId ?? null,
          reference: input.reference.trim(),
          received: input.received,
          restocked: false,
        };
        const updated = await tx.fiscalDocument.update({
          where: { id: documentId },
          data: { settledAt: new Date(), settlement },
        });
        await tx.auditLog.create({
          data: {
            organizationId: org,
            branchId: branch,
            actorId: actor,
            entityType: "FISCAL_DOCUMENT",
            entityId: documentId,
            action: "CREDIT_SETTLED",
            after: settlement,
          },
        });
        return { settledAt: updated.settledAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  /**
   * Nota de crédito C productiva (SISTEMA-110): queda en cola dentro de la
   * transacción de la devolución, que ya movió plata y stock; por eso nace
   * liquidada. Requiere la factura productiva autorizada.
   */
  async enqueueCredit(
    tx: Prisma.TransactionClient,
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    nota: NotaFiscal,
    liquidacion: Prisma.InputJsonValue,
  ) {
    await this.configurations.validate(tx, org, branch);
    const original = await tx.fiscalDocument.findFirst({
      where: {
        sourceSaleId: saleId,
        organizationId: org,
        branchId: branch,
        kind: "INVOICE",
      },
    });
    if (!original || original.status !== "AUTHORIZED")
      throw new BadRequestException(
        "La factura de la venta todavía no está autorizada por ARCA. Esperá a que se autorice para hacer la nota de crédito.",
      );
    const prior = await tx.fiscalDocument.aggregate({
      where: { originalId: original.id, status: { not: "REJECTED" } },
      _sum: { totalMinor: true },
    });
    if (
      nota.totalMinor <= 0n ||
      nota.totalMinor + BigInt(prior._sum.totalMinor ?? 0) >
        BigInt(original.totalMinor)
    )
      throw new BadRequestException(
        "La nota de crédito supera lo que queda de la factura.",
      );
    const snapshot = obj(original.saleSnapshot);
    const created = await tx.fiscalDocument.create({
      data: {
        organizationId: org,
        branchId: branch,
        sourceSaleId: saleId,
        requestId: nota.requestId,
        environment: "PRODUCTION",
        kind: "CREDIT_NOTE",
        originalId: original.id,
        customerReturnId: nota.customerReturnId,
        status: "QUEUED",
        issuerCuit: original.issuerCuit,
        point: original.point,
        voucherType: 13,
        date: argentinaDate(),
        totalMinor: Number(nota.totalMinor),
        docType: original.docType,
        docNumber: original.docNumber,
        recipientVatId: original.recipientVatId,
        issuer: original.issuer as Prisma.InputJsonValue,
        saleSnapshot: {
          ...snapshot,
          items: nota.items,
          originalNumber: `${String(original.point).padStart(5, "0")}-${String(original.number).padStart(8, "0")}`,
        } as Prisma.InputJsonValue,
        reason: nota.reason,
        settledAt: new Date(),
        settlement: liquidacion,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: org,
        branchId: branch,
        actorId: actor,
        entityType: "FISCAL_DOCUMENT",
        entityId: created.id,
        action: "CREDIT_QUEUED",
        after: {
          originalId: original.id,
          customerReturnId: nota.customerReturnId,
          totalMinor: nota.totalMinor.toString(),
          reason: nota.reason,
        },
      },
    });
    return created;
  }
}
