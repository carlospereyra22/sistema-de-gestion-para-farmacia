import { Injectable, BadRequestException } from "@nestjs/common";
import { lockCashSession } from "../cash/lock-cash-session";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { ProductionSalesService } from "./production-sales.service";
import { ProductionConfigurationService } from "./production-configuration.service";
import { argentinaDate } from "./fiscal-trial.service";
import { creditLineAmount } from "./credit-lines";
import { obj, list, str } from "./arca-soap";
import { AccountsService } from "../accounts/accounts.service";

export type CreditRequest = {
  requestId: string;
  reason: string;
  items: { saleItemId: string; quantity: number }[];
  confirmProduction: boolean;
};
@Injectable()
export class ProductionCreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: ProductionSalesService,
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
  async detail(actor: string, org: string, branch: string, saleId: string) {
    await this.organizations.authorizeFiscalSale(actor, org);
    const sale = await this.prisma.sale.findFirstOrThrow({
      where: { id: saleId, organizationId: org, branchId: branch },
      include: { items: true },
    });
    const original = await this.prisma.fiscalDocument.findFirst({
      where: {
        sourceSaleId: saleId,
        organizationId: org,
        kind: "INVOICE",
        status: "AUTHORIZED",
      },
    });
    if (!original)
      throw new BadRequestException(
        "La venta no tiene una factura productiva autorizada.",
      );
    const credits = await this.prisma.fiscalDocument.findMany({
      where: { originalId: original.id },
      orderBy: { createdAt: "desc" },
    });
    const reserved = credits
      .filter((doc) => doc.status !== "REJECTED")
      .flatMap((doc) => list(obj(doc.saleSnapshot).items).map(obj));
    const names = list(obj(original.saleSnapshot).items).map(obj);
    return {
      original: this.sales.present(original),
      credits: credits.map((doc) => this.sales.present(doc)),
      items: sale.items.map((item) => ({
        id: item.id,
        name:
          item.description ||
          str(names.find((n) => str(n.productId) === item.productId)?.name) ||
          "Producto",
        quantity: item.quantity,
        available:
          item.quantity -
          reserved
            .filter((r) => r.saleItemId === item.id)
            .reduce((n, r) => n + Number(r.quantity), 0),
        unitPriceMinor: String(item.unitPriceMinor),
        discountMinor: String(item.discountMinor),
      })),
    };
  }
  async create(
    actor: string,
    org: string,
    branch: string,
    saleId: string,
    input: CreditRequest,
  ) {
    await this.organizations.authorizeFiscalSale(actor, org);
    if (
      !input.confirmProduction ||
      input.reason.trim().length < 3 ||
      !input.items.length ||
      new Set(input.items.map((i) => i.saleItemId)).size !== input.items.length
    )
      throw new BadRequestException(
        "Confirmá la nota de crédito, el motivo y los artículos sin repetir.",
      );
    const doc = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${saleId}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
      const existing = await tx.fiscalDocument.findUnique({
        where: {
          organizationId_requestId: {
            organizationId: org,
            requestId: input.requestId,
          },
        },
      });
      if (existing) {
        if (existing.sourceSaleId !== saleId || existing.kind !== "CREDIT_NOTE")
          throw new BadRequestException(
            "La operación pertenece a otro comprobante.",
          );
        return existing;
      }
      await this.configurations.validate(tx, org, branch);
      const original = await tx.fiscalDocument.findFirst({
        where: {
          sourceSaleId: saleId,
          organizationId: org,
          branchId: branch,
          kind: "INVOICE",
          status: "AUTHORIZED",
        },
      });
      if (!original)
        throw new BadRequestException(
          "Se requiere una factura productiva autorizada.",
        );
      const sale = await tx.sale.findFirstOrThrow({
        where: {
          id: saleId,
          organizationId: org,
          branchId: branch,
          status: "COMPLETED",
        },
        include: { items: true },
      });
      const prior = await tx.fiscalDocument.findMany({
        where: { originalId: original.id, status: { not: "REJECTED" } },
      });
      const reserved = prior.flatMap((doc) =>
        list(obj(doc.saleSnapshot).items).map(obj),
      );
      const names = list(obj(original.saleSnapshot).items).map(obj);
      const items = input.items.map((requested) => {
        const item = sale.items.find(
          (line) => line.id === requested.saleItemId,
        );
        if (!item)
          throw new BadRequestException("El artículo no pertenece a la venta.");
        const returned = reserved
          .filter((line) => line.saleItemId === item.id)
          .reduce((n, line) => n + Number(line.quantity), 0);
        const amount = creditLineAmount(
          item.unitPriceMinor,
          item.discountMinor,
          item.quantity,
          returned,
          requested.quantity,
        );
        return {
          saleItemId: item.id,
          productId: item.productId,
          name:
            item.description ||
            str(names.find((n) => str(n.productId) === item.productId)?.name) ||
            "Producto",
          quantity: requested.quantity,
          unitPriceMinor: String(item.unitPriceMinor),
          discountMinor: String(
            item.unitPriceMinor * BigInt(requested.quantity) - amount,
          ),
          amountMinor: String(amount),
        };
      });
      const total = items.reduce((n, item) => n + BigInt(item.amountMinor), 0n);
      if (
        total <= 0n ||
        total + prior.reduce((n, doc) => n + BigInt(doc.totalMinor), 0n) >
          BigInt(original.totalMinor)
      )
        throw new BadRequestException(
          "El crédito excede la factura original o es cero.",
        );
      const snapshot = obj(original.saleSnapshot);
      const created = await tx.fiscalDocument.create({
        data: {
          organizationId: org,
          branchId: branch,
          sourceSaleId: saleId,
          requestId: input.requestId,
          environment: "PRODUCTION",
          kind: "CREDIT_NOTE",
          originalId: original.id,
          status: "QUEUED",
          issuerCuit: original.issuerCuit,
          point: original.point,
          voucherType: 13,
          date: argentinaDate(),
          totalMinor: Number(total),
          docType: original.docType,
          docNumber: original.docNumber,
          recipientVatId: original.recipientVatId,
          issuer: original.issuer as Prisma.InputJsonValue,
          saleSnapshot: {
            ...snapshot,
            items,
            originalNumber: `${String(original.point).padStart(5, "0")}-${String(original.number).padStart(8, "0")}`,
          } as Prisma.InputJsonValue,
          reason: input.reason.trim(),
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
            items: input.items,
            totalMinor: String(total),
            reason: input.reason.trim(),
          },
        },
      });
      return created;
    });
    return this.sales.process(actor, org, branch, saleId, doc.id);
  }
}
