import { lockCashSession } from "../cash/lock-cash-session";
import { recordPendingCollection } from "../cash/pending-collection";
import { assertCollectionSession } from "../cash/cash-settings";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { organizationTicketStore } from "../organizations/ticket-header";
import { createHash } from "node:crypto";
import { priceAdjustments, priceIncrease } from "./price-adjustment";
import { settlementAdjustments } from "./settlement-adjustments";
import { accountToday, accountDueStatus } from "./account-due-date";
import { saleAccountHistory } from "./sale-account-history";
import {
  normalizeReceiptPayments,
  readReceiptPayments,
  type ReceiptPayment,
} from "./receipt-payments";
import {
  distributeDebtIncrease,
  type TotalDebtInput,
} from "./total-debt-increase";
import {
  readAllocations,
  validateAllocations,
  type ItemAllocation,
} from "./item-allocations";

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
      include: {
        accountMovements: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
      orderBy: { name: "asc" },
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      document: customer.document,
      billingTaxId: customer.billingTaxId,
      billingPhone: customer.billingPhone,
      creditEnabled: customer.creditEnabled,
      active: customer.active,
      creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
      accountTermDays: customer.accountTermDays,
      balanceMinor: this.balance(customer.accountMovements).toString(),
      movements: customer.accountMovements.map((movement) => ({
        ...movement,
        isPriceAdjustment: priceAdjustments(movement.allocations).length > 0,
        isDebtAdjustment: Boolean(
          movement.allocations &&
          typeof movement.allocations === "object" &&
          !Array.isArray(movement.allocations) &&
          movement.allocations.kind === "MANUAL_DEBT_ADJUSTMENT",
        ),
        amountMinor: movement.amountMinor.toString(),
      })),
    }));
  }
  async statement(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    return this.prisma.$transaction(
      async (tx) => {
        const access = await tx.userBranch.findFirst({
          where: { userId: actorId, branchId, branch: { organizationId } },
        });
        if (!access)
          throw new ForbiddenException("No tenés acceso a esta sucursal.");
        const customers = await tx.customer.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            document: true,
            billingTaxId: true,
            billingPhone: true,
            accountMovements: {
              where: { organizationId, branchId },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                createdAt: true,
                type: true,
                amountMinor: true,
                note: true,
                saleId: true,
                allocations: true,
              },
            },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
        return customers.map(({ accountMovements, ...customer }) => {
          let balance = 0n;
          return {
            ...customer,
            movements: accountMovements.map(({ allocations, ...movement }) => {
              balance +=
                movement.type === "DEBIT"
                  ? movement.amountMinor
                  : -movement.amountMinor;
              return {
                ...movement,
                showInStatement:
                  movement.type === "CREDIT"
                    ? !movement.saleId
                    : Boolean(movement.saleId) &&
                      !(
                        allocations &&
                        typeof allocations === "object" &&
                        !Array.isArray(allocations) &&
                        (allocations.kind === "PRICE_ADJUSTMENT" ||
                          allocations.kind === "MANUAL_DEBT_ADJUSTMENT")
                      ),
                amountMinor: movement.amountMinor.toString(),
                balanceMinor: balance.toString(),
              };
            }),
          };
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async saleDetail(
    actorId: string,
    organizationId: string,
    customerId: string,
    movementId: string,
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    const movement = await this.prisma.customerAccountMovement.findFirst({
      where: { id: movementId, organizationId, customerId },
      include: { sale: { include: { items: true, payments: true } } },
    });
    if (
      !movement?.sale ||
      movement.sale.organizationId !== organizationId ||
      movement.sale.customerId !== customerId
    )
      throw new NotFoundException("No se encontró la compra vinculada.");
    const sale = movement.sale;
    const access = await this.prisma.userBranch.findUnique({
      where: { userId_branchId: { userId: actorId, branchId: sale.branchId } },
    });
    if (!access)
      throw new ForbiddenException(
        "No tenés acceso a la sucursal de esta compra.",
      );
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        id: {
          in: sale.items.flatMap((item) =>
            item.productId ? [item.productId] : [],
          ),
        },
      },
      select: { id: true, name: true },
    });
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    return {
      id: sale.id,
      status: sale.status,
      completedAt: sale.completedAt,
      totalMinor: sale.totalMinor.toString(),
      accountAmountMinor: sale.payments
        .filter((payment) => payment.method === "ACCOUNT")
        .reduce((sum, payment) => sum + payment.amountMinor, 0n)
        .toString(),
      items: sale.items.map((item) => ({
        id: item.id,
        name:
          item.description ??
          names.get(item.productId ?? "") ??
          "Producto no disponible",
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor.toString(),
        discountMinor: item.discountMinor.toString(),
        subtotalMinor: (
          item.unitPriceMinor * BigInt(item.quantity) -
          item.discountMinor
        ).toString(),
      })),
    };
  }
  async configure(
    actorId: string,
    organizationId: string,
    customerId: string,
    enabled: boolean,
    limitMinor: number | null,
    accountTermDays?: number | null,
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_MANAGE");
    if (
      accountTermDays != null &&
      (!Number.isInteger(accountTermDays) ||
        accountTermDays < 0 ||
        accountTermDays > 3650)
    )
      throw new BadRequestException(
        "El plazo debe ser entre 0 y 3650 días corridos, o sin vencimiento.",
      );
    if (
      limitMinor !== null &&
      (!Number.isSafeInteger(limitMinor) || limitMinor < 0)
    )
      throw new BadRequestException(
        "El límite de crédito debe ser un importe válido.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId },
        });
        if (!customer) throw new NotFoundException("Customer is unavailable.");
        await tx.customer.update({
          where: { id: customerId },
          data: {
            creditEnabled: enabled,
            creditLimitMinor: limitMinor === null ? null : BigInt(limitMinor),
            accountTermDays,
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          actorId,
          entityType: "CUSTOMER_ACCOUNT",
          entityId: customerId,
          action: "CREDIT_CONFIGURED",
          before: {
            enabled: customer.creditEnabled,
            limitMinor: customer.creditLimitMinor?.toString() ?? null,
            accountTermDays: customer.accountTermDays,
          },
          after: {
            enabled,
            limitMinor,
            accountTermDays:
              accountTermDays === undefined
                ? customer.accountTermDays
                : accountTermDays,
          },
        });
        return {
          id: customerId,
          creditEnabled: enabled,
          creditLimitMinor: limitMinor === null ? null : String(limitMinor),
          accountTermDays:
            accountTermDays === undefined
              ? customer.accountTermDays
              : accountTermDays,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async dueDates(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    return this.prisma.$transaction(
      async (tx) => {
        const access = await tx.userBranch.findFirst({
          where: { userId: actorId, branchId, branch: { organizationId } },
        });
        if (!access) throw new ForbiddenException("Sin acceso a la sucursal.");
        const today = accountToday(new Date());
        const sales = await tx.sale.findMany({
          where: {
            organizationId,
            branchId,
            status: "COMPLETED",
            customerId: { not: null },
            payments: { some: { method: "ACCOUNT" } },
          },
          select: {
            id: true,
            customerId: true,
            completedAt: true,
            accountDueDate: true,
            customerReturns: { select: { id: true } },
          },
          orderBy: [{ accountDueDate: "asc" }, { id: "asc" }],
        });
        const customers = await tx.customer.findMany({
          where: {
            organizationId,
            id: { in: [...new Set(sales.map((sale) => sale.customerId!))] },
          },
          select: { id: true, name: true },
        });
        const rows: {
          saleId: string;
          customerId: string;
          customerName: string;
          saleDate: string | null;
          dueDate: string | null;
          pendingMinor: string | null;
          daysOverdue: number;
          status: "REVIEW" | "UNDATED" | "TODAY" | "OVERDUE" | "UPCOMING";
          reviewReason: string | null;
        }[] = [];
        for (const customer of customers) {
          const detail = await this.itemBalances(
            tx,
            actorId,
            organizationId,
            customer.id,
          );
          for (const sale of sales.filter(
            (value) => value.customerId === customer.id,
          )) {
            const reviewReason = detail.unassignedReceipts.length
              ? "Cobros sin conciliar"
              : detail.mixedSales.some((value) => value.saleId === sale.id)
                ? "Financiación sin asignar"
                : sale.customerReturns.length
                  ? "Revisar devoluciones"
                  : null;
            const pending = detail.items
              .filter((item) => item.saleId === sale.id)
              .reduce((sum, item) => sum + BigInt(item.pendingMinor), 0n);
            if (!reviewReason && pending <= 0n) continue;
            rows.push({
              saleId: sale.id,
              customerId: customer.id,
              customerName: customer.name,
              saleDate: sale.completedAt?.toISOString() ?? null,
              dueDate: sale.accountDueDate?.toISOString().slice(0, 10) ?? null,
              pendingMinor: reviewReason ? null : pending.toString(),
              ...accountDueStatus(sale.accountDueDate, today),
              ...(reviewReason
                ? { status: "REVIEW" as const, daysOverdue: 0 }
                : {}),
              reviewReason,
            });
          }
        }
        rows.sort(
          (a, b) =>
            (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
            a.customerName.localeCompare(b.customerName) ||
            a.saleId.localeCompare(b.saleId),
        );
        return { today, rows };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async dueSaleDetail(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    return this.prisma.$transaction(
      async (tx) => {
        const access = await tx.userBranch.findFirst({
          where: { userId: actorId, branchId, branch: { organizationId } },
        });
        if (!access) throw new ForbiddenException("Sin acceso a la sucursal.");
        const sale = await tx.sale.findFirst({
          where: {
            id: saleId,
            organizationId,
            branchId,
            customerId: { not: null },
            payments: { some: { method: "ACCOUNT" } },
          },
          include: { items: true, payments: true, customerReturns: true },
        });
        if (!sale?.customerId)
          throw new NotFoundException("Venta no disponible en esta sucursal.");
        const customer = await tx.customer.findFirstOrThrow({
          where: { id: sale.customerId, organizationId },
          select: {
            id: true,
            name: true,
            document: true,
            billingTaxId: true,
            billingPhone: true,
            active: true,
            creditEnabled: true,
          },
        });
        const branch = await tx.branch.findFirstOrThrow({
          where: { id: branchId, organizationId },
          select: { name: true },
        });
        const balances = await this.itemBalances(
          tx,
          actorId,
          organizationId,
          customer.id,
        );
        const reviewReason = balances.unassignedReceipts.length
          ? "Hay cobros sin asignar. Los pagos y saldos pueden estar incompletos."
          : balances.mixedSales.some((s) => s.saleId === saleId)
            ? "La financiación de esta venta necesita conciliación."
            : sale.customerReturns.length
              ? "Esta venta tiene devoluciones que deben revisarse."
              : null;
        const movements = await tx.customerAccountMovement.findMany({
          where: { organizationId, customerId: customer.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        // Receipts may be registered in another branch, but expose only allocations
        // belonging to the authorized sale, never other sales' data or receipts.
        const history = saleAccountHistory(
          saleId,
          sale.items.map((i) => i.id),
          movements,
          sale.accountDueDate,
          new Date(),
          !reviewReason && sale.status === "COMPLETED",
        );
        const actorIds = [
          ...new Set(
            [
              ...history.events.map((e) => e.actorId),
              ...history.receipts.map((p) => p.actorId),
            ].filter((id): id is string => Boolean(id)),
          ),
        ];
        const members = await tx.userOrganization.findMany({
          where: { organizationId, userId: { in: actorIds } },
          select: { userId: true, displayName: true },
        });
        const actorName = (id: string | null) =>
          members.find((m) => m.userId === id)?.displayName ?? null;
        const products = await tx.product.findMany({
          where: {
            organizationId,
            id: {
              in: sale.items.flatMap((i) => (i.productId ? [i.productId] : [])),
            },
          },
          select: { id: true, name: true },
        });
        const pending = balances.items
          .filter((i) => i.saleId === saleId)
          .reduce((sum, i) => sum + BigInt(i.pendingMinor), 0n);
        const financed = sale.payments
          .filter((p) => p.method === "ACCOUNT")
          .reduce((sum, p) => sum + p.amountMinor, 0n);
        const initialPaid =
          sale.totalMinor > financed ? sale.totalMinor - financed : 0n;
        const paid =
          initialPaid +
          history.receipts.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n);
        const today = accountToday(new Date());
        const status =
          sale.status !== "COMPLETED"
            ? "CANCELLED"
            : reviewReason
              ? "REVIEW"
              : pending === 0n
                ? "PAID"
                : accountDueStatus(sale.accountDueDate, today).status;
        const initialMethods = [
          ...new Set(
            sale.payments
              .filter((p) => p.method !== "ACCOUNT")
              .map((p) => p.method),
          ),
        ];
        return {
          id: sale.id,
          customer,
          branchName: branch.name,
          saleDate: sale.completedAt?.toISOString() ?? null,
          dueDate: sale.accountDueDate?.toISOString().slice(0, 10) ?? null,
          status,
          daysOverdue:
            status === "OVERDUE"
              ? accountDueStatus(sale.accountDueDate, today).daysOverdue
              : 0,
          totalMinor: sale.totalMinor.toString(),
          financedMinor: financed.toString(),
          paidMinor: paid.toString(),
          pendingMinor: reviewReason
            ? null
            : sale.status === "COMPLETED"
              ? pending.toString()
              : "0",
          reviewReason,
          seller: actorName(
            movements.find((m) => m.saleId === saleId && m.type === "DEBIT")
              ?.actorId ?? null,
          ),
          items: sale.items.map((i) => ({
            id: i.id,
            name:
              i.description ??
              products.find((p) => p.id === i.productId)?.name ??
              "Producto no disponible",
            quantity: i.quantity,
            unitPriceMinor: i.unitPriceMinor.toString(),
            discountMinor: i.discountMinor.toString(),
            totalMinor: (
              i.unitPriceMinor * BigInt(i.quantity) -
              i.discountMinor
            ).toString(),
            pendingMinor: reviewReason
              ? null
              : (balances.items.find((b) => b.saleItemId === i.id)
                  ?.pendingMinor ?? "0"),
          })),
          payments: [
            ...(initialPaid > 0n
              ? [
                  {
                    id: "initial",
                    at:
                      sale.completedAt?.toISOString() ??
                      sale.createdAt.toISOString(),
                    method:
                      initialMethods.length === 1 ? initialMethods[0] : "OTHER",
                    amountMinor: initialPaid.toString(),
                    note: "Pago al realizar la venta (neto de vuelto)",
                    actor: null,
                    shared: false,
                  },
                ]
              : []),
            ...history.receipts.map((p) => ({
              id: p.id,
              at: p.at,
              method: p.method,
              amountMinor: p.amountMinor,
              note: p.note,
              actor: actorName(p.actorId),
              shared: p.amountMinor !== p.receiptTotalMinor,
            })),
          ],
          events: history.events.map(({ actorId: id, ...e }) => ({
            ...e,
            actor: actorName(id),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async pay(
    actorId: string,
    organizationId: string,
    branchId: string,
    customerId: string,
    amountMinor: number,
    method: PaymentMethod,
    note?: string,
    cashSessionId?: string,
    clientOperationId?: string,
    allocations?: ItemAllocation[],
    payments?: ReceiptPayment[],
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_MANAGE");
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new BadRequestException("Ingresá un importe válido.");
    const parts = normalizeReceiptPayments(amountMinor, method, payments);
    const cashAmount =
      parts.find((part) => part.method === "CASH")?.amountMinor ?? 0;
    if (parts.length > 1 && !allocations?.length)
      throw new BadRequestException(
        "Seleccioná los artículos del cobro mixto.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        if (clientOperationId) {
          const previous = await tx.customerAccountMovement.findUnique({
            where: {
              organizationId_clientOperationId: {
                organizationId,
                clientOperationId,
              },
            },
          });
          if (previous) {
            const previousParts = readReceiptPayments(previous.allocations) ?? [
              {
                method: previous.paymentMethod,
                amountMinor: Number(previous.amountMinor),
              },
            ];
            if (
              previous.customerId !== customerId ||
              previous.amountMinor !== BigInt(amountMinor) ||
              previous.paymentMethod !== method ||
              previous.branchId !== branchId ||
              JSON.stringify(previousParts) !== JSON.stringify(parts) ||
              previous.cashSessionId !== (cashSessionId ?? null)
            )
              throw new BadRequestException(
                "El identificador del recibo ya fue utilizado.",
              );
            if (
              allocations &&
              JSON.stringify(
                [...readAllocations(previous.allocations)].sort((a, b) =>
                  a.saleItemId.localeCompare(b.saleItemId),
                ),
              ) !==
                JSON.stringify(
                  [...allocations].sort((a, b) =>
                    a.saleItemId.localeCompare(b.saleItemId),
                  ),
                )
            )
              throw new BadRequestException(
                "El recibo ya existe con otra selección de artículos.",
              );
            return {
              id: previous.id,
              amountMinor: previous.amountMinor.toString(),
            };
          }
        }
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId },
          include: { accountMovements: true },
        });
        if (!customer)
          throw new NotFoundException("Customer account is unavailable.");
        let adjustmentTotal = 0n;
        if (
          !allocations?.some(
            (item) => item.expectedPendingMinor !== undefined,
          ) &&
          BigInt(amountMinor) > this.balance(customer.accountMovements)
        )
          throw new BadRequestException(
            "El cobro supera el saldo pendiente del cliente.",
          );
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
          throw new BadRequestException("Ingresá un importe válido.");
        await assertCollectionSession(tx, branchId, cashSessionId);
        if (cashSessionId) {
          if (cashSessionId) await lockCashSession(tx, cashSessionId);
          const session = cashSessionId
            ? await tx.cashSession.findFirst({
                where: { id: cashSessionId, closedAt: null },
              })
            : null;
          const register = session
            ? await tx.cashRegister.findFirst({
                where: { id: session.cashRegisterId, branchId },
              })
            : null;
          if (!register)
            throw new BadRequestException(
              "Seleccioná una caja abierta de esta sucursal para recibir efectivo.",
            );
        }
        if (allocations) {
          const detail = await this.itemBalances(
            tx,
            actorId,
            organizationId,
            customerId,
          );
          if (detail.unassignedReceipts.length)
            throw new BadRequestException(
              "Primero asigná los cobros anteriores a sus artículos.",
            );
          const pending = new Map(
            detail.items.map((item) => [
              item.saleItemId,
              BigInt(item.pendingMinor),
            ]),
          );
          const adjustments = settlementAdjustments(allocations, pending);
          if (adjustments.length && detail.mixedSales.length)
            throw new BadRequestException(
              "Conciliá las ventas antes de ajustar sus importes.",
            );
          for (const adjustment of adjustments)
            pending.set(adjustment.saleItemId, adjustment.after);
          validateAllocations(allocations, amountMinor, pending);
          adjustmentTotal = adjustments.reduce(
            (sum, item) => sum + item.delta,
            0n,
          );
          if (
            BigInt(amountMinor) >
            this.balance(customer.accountMovements) + adjustmentTotal
          )
            throw new BadRequestException(
              "El cobro supera el saldo ajustado del cliente.",
            );
          for (const adjustment of adjustments.filter(
            (item) => item.delta !== 0n,
          )) {
            const item = detail.items.find(
              (item) => item.saleItemId === adjustment.saleItemId,
            )!;
            const sale = await tx.sale.findFirst({
              where: {
                id: item.saleId,
                organizationId,
                customerId,
                status: "COMPLETED",
              },
              include: { customerReturns: { select: { id: true } } },
            });
            if (!sale || sale.customerReturns.length)
              throw new BadRequestException(
                "No se puede ajustar una venta con devoluciones.",
              );
            const adjustmentMovement = await tx.customerAccountMovement.create({
              data: {
                organizationId,
                branchId: sale.branchId,
                customerId,
                saleId: sale.id,
                actorId,
                type: adjustment.delta > 0n ? "DEBIT" : "CREDIT",
                amountMinor:
                  adjustment.delta > 0n ? adjustment.delta : -adjustment.delta,
                note: "Ajuste del importe final al cobrar",
                allocations: {
                  kind: "MANUAL_DEBT_ADJUSTMENT",
                  receiptOperationId: clientOperationId ?? null,
                  items: [
                    {
                      saleItemId: item.saleItemId,
                      amountMinor: (adjustment.delta > 0n
                        ? adjustment.delta
                        : -adjustment.delta
                      ).toString(),
                      unitPriceMinor: "0",
                    },
                  ],
                },
              },
            });
            await this.audit.recordInTransaction(tx, {
              organizationId,
              branchId: sale.branchId,
              actorId,
              entityType: "CUSTOMER_ACCOUNT",
              entityId: adjustmentMovement.id,
              action: "DEBT_SETTLED_ADJUSTMENT",
              before: { pendingMinor: adjustment.before.toString() },
              after: {
                pendingMinor: adjustment.after.toString(),
                saleItemId: item.saleItemId,
                receiptOperationId: clientOperationId ?? null,
              },
            });
          }
        }
        const movement = await tx.customerAccountMovement.create({
          data: {
            organizationId,
            branchId,
            customerId,
            type: "CREDIT",
            amountMinor: BigInt(amountMinor),
            note: note?.trim() || "Cobro de cuenta corriente",
            actorId,
            paymentMethod: method,
            clientOperationId,
            allocations:
              parts.length > 1
                ? {
                    kind: "MIXED_RECEIPT",
                    payments: parts.map((part) => ({ ...part })),
                    items: allocations!.map((item) => ({ ...item })),
                  }
                : allocations
                  ? allocations.map((item) => ({ ...item }))
                  : undefined,
            cashSessionId: cashSessionId ?? null,
          },
        });
        if (!cashSessionId)
          await recordPendingCollection(
            tx,
            {
              organizationId,
              branchId,
              actorId,
              sourceType: "RECEIPT",
              sourceId: movement.id,
            },
            parts,
          );
        if (cashAmount > 0 && cashSessionId)
          await tx.cashMovement.create({
            data: {
              cashSessionId,
              type: "IN",
              amountMinor: BigInt(cashAmount),
              actorId,
              reason: `Cobro cuenta corriente · ${customer.name} · Recibo ${movement.id}`,
            },
          });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "CUSTOMER_ACCOUNT",
          entityId: movement.id,
          action: "RECEIPT",
          after: {
            customerId,
            amountMinor,
            method,
            receipt: await this.receiptData(
              tx,
              organizationId,
              movement,
              customer.name,
              (
                this.balance(customer.accountMovements) +
                adjustmentTotal -
                BigInt(amountMinor)
              ).toString(),
            ),
          },
        });
        return {
          id: movement.id,
          amountMinor: movement.amountMinor.toString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async items(actorId: string, organizationId: string, customerId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    return this.prisma.$transaction(
      (tx) => this.itemBalances(tx, actorId, organizationId, customerId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private async receiptData(
    tx: Prisma.TransactionClient,
    org: string,
    movement: {
      id: string;
      branchId: string;
      createdAt: Date;
      amountMinor: bigint;
      paymentMethod: string | null;
      note: string | null;
      allocations: Prisma.JsonValue | null;
    },
    customerName: string,
    balanceAfterMinor: string | null,
  ) {
    const allocations = readAllocations(movement.allocations);
    const saleItems = await tx.saleItem.findMany({
      where: {
        id: { in: allocations.map((item) => item.saleItemId) },
        sale: { organizationId: org },
      },
    });
    const products = await tx.product.findMany({
      where: {
        organizationId: org,
        id: {
          in: saleItems.flatMap((item) =>
            item.productId ? [item.productId] : [],
          ),
        },
      },
      select: { id: true, name: true },
    });
    const branch = await tx.branch.findFirst({
      where: { id: movement.branchId, organizationId: org },
      select: { name: true },
    });
    return {
      id: movement.id,
      createdAt: movement.createdAt.toISOString(),
      customerName,
      branchName: branch?.name ?? "",
      amountMinor: movement.amountMinor.toString(),
      method: readReceiptPayments(movement.allocations)
        ? "MIXED"
        : movement.paymentMethod,
      ...(readReceiptPayments(movement.allocations)
        ? {
            payments: readReceiptPayments(movement.allocations)!.map(
              (part) => ({
                method: part.method,
                amountMinor: String(part.amountMinor),
              }),
            ),
          }
        : {}),
      note: movement.note,
      balanceAfterMinor,
      items: allocations.map((allocation) => {
        const line = saleItems.find(
          (item) => item.id === allocation.saleItemId,
        );
        return {
          name:
            line?.description ??
            products.find((item) => item.id === line?.productId)?.name ??
            "Artículo",
          saleId: line?.saleId ?? "",
          amountMinor: String(allocation.amountMinor),
        };
      }),
    };
  }
  async receipt(
    actorId: string,
    org: string,
    customer: string,
    receiptId: string,
  ) {
    await this.assert(actorId, org, "ACCOUNT_READ");
    return this.prisma.$transaction(
      async (tx) => {
        const movement = await tx.customerAccountMovement.findFirst({
          where: {
            id: receiptId,
            organizationId: org,
            customerId: customer,
            type: "CREDIT",
            saleId: null,
          },
          include: { customer: { select: { name: true } } },
        });
        if (!movement) throw new NotFoundException("No se encontró el cobro.");
        if (
          !(await tx.userBranch.findUnique({
            where: {
              userId_branchId: { userId: actorId, branchId: movement.branchId },
            },
          }))
        )
          throw new ForbiddenException(
            "No tenés acceso a la sucursal del cobro.",
          );
        const audit = await tx.auditLog.findFirst({
          where: {
            organizationId: org,
            entityType: "CUSTOMER_ACCOUNT",
            entityId: receiptId,
            action: "RECEIPT",
          },
          orderBy: { createdAt: "asc" },
        });
        const organization = await tx.organization.findUnique({
          where: { id: org },
          select: { name: true, ticketHeader: true },
        });
        const cashier = audit?.actorId
          ? await tx.userOrganization.findUnique({
              where: {
                userId_organizationId: {
                  userId: audit.actorId,
                  organizationId: org,
                },
              },
              select: { displayName: true },
            })
          : null;
        const printContext = {
          store: organizationTicketStore(organization),
          cashier: cashier?.displayName || undefined,
        };
        const snapshot = audit?.after;
        if (
          snapshot &&
          typeof snapshot === "object" &&
          !Array.isArray(snapshot) &&
          snapshot.receipt &&
          typeof snapshot.receipt === "object" &&
          !Array.isArray(snapshot.receipt)
        )
          return { ...snapshot.receipt, ...printContext };
        const receipt = await this.receiptData(
          tx,
          org,
          movement,
          movement.customer.name,
          null,
        );
        return { ...receipt, ...printContext };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async itemBalances(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string,
    customerId: string,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("No se encontró el cliente.");
    const memberships = await tx.userBranch.findMany({
      where: { userId: actorId },
      select: { branchId: true },
    });
    const sales = await tx.sale.findMany({
      where: {
        organizationId,
        customerId,
        status: "COMPLETED",
        branchId: { in: memberships.map((member) => member.branchId) },
        payments: { some: { method: "ACCOUNT" } },
      },
      include: {
        items: { orderBy: { id: "asc" } },
        payments: true,
        customerReturns: { select: { id: true } },
      },
      orderBy: { completedAt: "asc" },
    });
    const movements = await tx.customerAccountMovement.findMany({
      where: { organizationId, customerId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const paid = new Map<string, bigint>();
    for (const movement of movements.filter(
      (item) => item.type === "CREDIT" && !item.saleId,
    )) {
      for (const allocation of readAllocations(movement.allocations))
        paid.set(
          allocation.saleItemId,
          (paid.get(allocation.saleItemId) ?? 0n) +
            BigInt(allocation.amountMinor),
        );
    }
    const products = await tx.product.findMany({
      where: {
        organizationId,
        id: {
          in: sales.flatMap((sale) =>
            sale.items.flatMap((item) =>
              item.productId ? [item.productId] : [],
            ),
          ),
        },
      },
      select: {
        id: true,
        name: true,
        externalReferencePriceMinor: true,
        externalReferenceSource: true,
        externalReferenceCheckedAt: true,
        priceDivisor: true,
        saleUnit: true,
      },
    });
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const items: {
      saleItemId: string;
      saleId: string;
      name: string;
      quantity: number;
      financedMinor: string;
      paidMinor: string;
      pendingMinor: string;
      createdAt: Date | null;
      previousPriceMinor: string;
      referencePriceMinor: string | null;
      referenceCheckedAt: Date | null;
      increaseMinor: string;
    }[] = [];
    const mixedSales: {
      saleId: string;
      movementId: string;
      financedMinor: string;
      items: {
        saleItemId: string;
        name: string;
        quantity: number;
        subtotalMinor: string;
      }[];
    }[] = [];
    for (const sale of sales) {
      const financed = sale.payments
        .filter((payment) => payment.method === "ACCOUNT")
        .reduce((sum, payment) => sum + payment.amountMinor, 0n);
      const debit = movements.find(
        (movement) =>
          movement.saleId === sale.id &&
          movement.type === "DEBIT" &&
          !priceAdjustments(movement.allocations).length,
      );
      const assigned = readAllocations(debit?.allocations ?? null);
      if (financed !== sale.totalMinor && !assigned.length) {
        mixedSales.push({
          saleId: sale.id,
          movementId: debit?.id ?? "",
          financedMinor: financed.toString(),
          items: sale.items.map((item) => ({
            saleItemId: item.id,
            name:
              item.description ?? names.get(item.productId ?? "") ?? "Producto",
            quantity: item.quantity,
            subtotalMinor: (
              item.unitPriceMinor * BigInt(item.quantity) -
              item.discountMinor
            ).toString(),
          })),
        });
        continue;
      }
      for (const item of sale.items) {
        let owed = assigned.length
          ? BigInt(
              assigned.find((entry) => entry.saleItemId === item.id)
                ?.amountMinor ?? 0,
            )
          : item.unitPriceMinor * BigInt(item.quantity) - item.discountMinor;
        let previous = item.unitPriceMinor;
        for (const movement of movements.filter(
          (entry) => entry.saleId === sale.id,
        ))
          for (const adjustment of priceAdjustments(
            movement.allocations,
          ).filter((entry) => entry.saleItemId === item.id)) {
            owed +=
              movement.type === "DEBIT"
                ? adjustment.amountMinor
                : -adjustment.amountMinor;
            if (adjustment.unitPriceMinor > previous)
              previous = adjustment.unitPriceMinor;
          }
        const settled = paid.get(item.id) ?? 0n;
        const pending = owed > settled ? owed - settled : 0n;
        const product = products.find((entry) => entry.id === item.productId);
        const reference = product?.externalReferencePriceMinor ?? null;
        const unassigned = movements.some(
          (entry) =>
            entry.type === "CREDIT" &&
            !entry.saleId &&
            !readAllocations(entry.allocations).length,
        );
        const comparable =
          product?.saleUnit === "BOX" &&
          product.priceDivisor == null &&
          Boolean(product.externalReferenceSource) &&
          Boolean(product.externalReferenceCheckedAt) &&
          !sale.customerReturns.length &&
          !unassigned;
        const increase =
          comparable && reference !== null
            ? priceIncrease(pending, previous, reference)
            : 0n;
        items.push({
          saleItemId: item.id,
          saleId: sale.id,
          name:
            item.description ?? names.get(item.productId ?? "") ?? "Producto",
          quantity: item.quantity,
          financedMinor: owed.toString(),
          paidMinor: settled.toString(),
          pendingMinor: pending.toString(),
          createdAt: sale.completedAt,
          previousPriceMinor: previous.toString(),
          referencePriceMinor: reference?.toString() ?? null,
          referenceCheckedAt: product?.externalReferenceCheckedAt ?? null,
          increaseMinor: increase.toString(),
        });
      }
    }
    return {
      items,
      mixedSales,
      unassignedReceipts: movements
        .filter(
          (movement) =>
            movement.type === "CREDIT" &&
            !movement.saleId &&
            !readAllocations(movement.allocations).length,
        )
        .map((movement) => ({
          id: movement.id,
          amountMinor: movement.amountMinor.toString(),
          createdAt: movement.createdAt,
        })),
      balanceMinor: this.balance(movements).toString(),
    };
  }
  private async pricePreview(
    tx: Prisma.TransactionClient,
    actorId: string,
    org: string,
    customer: string,
    saleId: string,
  ) {
    const detail = await this.itemBalances(tx, actorId, org, customer);
    const rows = detail.items.filter(
      (item) => saleId === "all" || item.saleId === saleId,
    );
    if (!rows.length)
      throw new BadRequestException(
        "La venta no está disponible para actualizar.",
      );
    const changed = rows.filter((item) => BigInt(item.increaseMinor) > 0n);
    const increase = changed.reduce(
      (sum, item) => sum + BigInt(item.increaseMinor),
      0n,
    );
    const pending = rows.reduce(
      (sum, item) => sum + BigInt(item.pendingMinor),
      0n,
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ saleId, balance: detail.balanceMinor, rows }))
      .digest("hex");
    return {
      fingerprint,
      items: changed,
      increaseMinor: increase.toString(),
      pendingMinor: pending.toString(),
      nextPendingMinor: (pending + increase).toString(),
    };
  }
  async previewPrices(
    actorId: string,
    org: string,
    customer: string,
    saleId: string,
  ) {
    await this.assert(actorId, org, "ACCOUNT_READ");
    return this.prisma.$transaction(
      (tx) => this.pricePreview(tx, actorId, org, customer, saleId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async increaseDebt(
    actorId: string,
    org: string,
    customer: string,
    saleItemId: string,
    input: {
      expectedPendingMinor: number;
      nextPendingMinor: number;
      reason: string;
      clientOperationId: string;
    },
  ) {
    await this.assert(actorId, org, "ACCOUNT_MANAGE");
    const reason = input.reason.trim();
    if (
      !Number.isSafeInteger(input.expectedPendingMinor) ||
      input.expectedPendingMinor <= 0 ||
      !Number.isSafeInteger(input.nextPendingMinor) ||
      input.nextPendingMinor <= input.expectedPendingMinor ||
      reason.length < 3 ||
      reason.length > 300
    )
      throw new BadRequestException(
        "Ingresá un saldo mayor al actual y un motivo de 3 a 300 caracteres.",
      );
    const payload = {
      kind: "MANUAL_DEBT_ADJUSTMENT",
      saleItemId,
      expectedPendingMinor: input.expectedPendingMinor,
      nextPendingMinor: input.nextPendingMinor,
      reason,
      // A manual balance adjustment does not change the reference-price baseline.
      items: [
        {
          saleItemId,
          amountMinor: String(
            input.nextPendingMinor - input.expectedPendingMinor,
          ),
          unitPriceMinor: "0",
        },
      ],
    };
    return this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.customerAccountMovement.findUnique({
          where: {
            organizationId_clientOperationId: {
              organizationId: org,
              clientOperationId: input.clientOperationId,
            },
          },
        });
        if (previous) {
          const stored = previous.allocations;
          if (
            previous.customerId !== customer ||
            !stored ||
            typeof stored !== "object" ||
            Array.isArray(stored) ||
            stored.kind !== payload.kind ||
            stored.saleItemId !== saleItemId ||
            stored.expectedPendingMinor !== input.expectedPendingMinor ||
            stored.nextPendingMinor !== input.nextPendingMinor ||
            stored.reason !== reason
          )
            throw new BadRequestException(
              "Identificador de operación ya utilizado.",
            );
          const membership = await tx.userBranch.findFirst({
            where: { userId: actorId, branchId: previous.branchId! },
          });
          if (!membership)
            throw new ForbiddenException(
              "Sin acceso a la sucursal de la venta.",
            );
          return { id: previous.id };
        }
        const detail = await this.itemBalances(tx, actorId, org, customer);
        const item = detail.items.find((row) => row.saleItemId === saleItemId);
        if (
          !item ||
          detail.unassignedReceipts.length ||
          detail.mixedSales.length
        )
          throw new BadRequestException(
            "El artículo no está disponible o hay cobros pendientes de conciliar.",
          );
        if (BigInt(item.pendingMinor) !== BigInt(input.expectedPendingMinor))
          throw new BadRequestException(
            "Cambió el saldo. Cerrá el ajuste y actualizá la cuenta antes de continuar.",
          );
        const sale = await tx.sale.findFirstOrThrow({
          where: {
            id: item.saleId,
            organizationId: org,
            customerId: customer,
            status: "COMPLETED",
          },
          include: { customerReturns: { select: { id: true } } },
        });
        if (sale.customerReturns.length)
          throw new BadRequestException(
            "No se puede aumentar una deuda con devoluciones registradas.",
          );
        const movement = await tx.customerAccountMovement.create({
          data: {
            organizationId: org,
            branchId: sale.branchId,
            customerId: customer,
            saleId: sale.id,
            type: "DEBIT",
            amountMinor:
              BigInt(input.nextPendingMinor) -
              BigInt(input.expectedPendingMinor),
            actorId,
            clientOperationId: input.clientOperationId,
            note: `Aumento manual de deuda · ${reason}`,
            allocations: payload,
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId: org,
          branchId: sale.branchId,
          actorId,
          entityType: "CUSTOMER_ACCOUNT",
          entityId: movement.id,
          action: "DEBT_INCREASED",
          before: {
            pendingMinor: item.pendingMinor,
            paidMinor: item.paidMinor,
          },
          after: {
            saleId: sale.id,
            saleItemId,
            name: item.name,
            pendingMinor: String(input.nextPendingMinor),
            increaseMinor: movement.amountMinor.toString(),
            reason,
          },
        });
        return { id: movement.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async increaseTotalDebt(
    actorId: string,
    org: string,
    customer: string,
    input: TotalDebtInput,
  ) {
    await this.assert(actorId, org, "ACCOUNT_MANAGE");
    const distribution = distributeDebtIncrease(input);
    const reason = input.reason.trim();
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          customer,
          current: input.expectedPendingMinor,
          next: input.nextPendingMinor,
          reason,
          distribution,
        }),
      )
      .digest("hex");
    return this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.customerAccountMovement.findUnique({
          where: {
            organizationId_clientOperationId: {
              organizationId: org,
              clientOperationId: input.clientOperationId,
            },
          },
        });
        if (previous) {
          const payload = previous.allocations;
          if (
            previous.customerId !== customer ||
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload) ||
            payload.kind !== "MANUAL_DEBT_ADJUSTMENT" ||
            payload.scope !== "all" ||
            payload.fingerprint !== fingerprint
          )
            throw new BadRequestException(
              "Identificador de operación ya utilizado.",
            );
          const movements = await tx.customerAccountMovement.findMany({
            where: {
              organizationId: org,
              customerId: customer,
              allocations: {
                path: ["batchOperationId"],
                equals: input.clientOperationId,
              },
            },
          });
          for (const movement of movements) {
            if (
              !(await tx.userBranch.findFirst({
                where: { userId: actorId, branchId: movement.branchId! },
              }))
            )
              throw new ForbiddenException(
                "Sin acceso a la sucursal de la venta.",
              );
          }
          return { id: previous.id };
        }
        const detail = await this.itemBalances(tx, actorId, org, customer);
        const pending = detail.items.filter(
          (item) => BigInt(item.pendingMinor) > 0n,
        );
        if (
          detail.unassignedReceipts.length ||
          detail.mixedSales.length ||
          BigInt(detail.balanceMinor) !== BigInt(input.expectedPendingMinor) ||
          pending.length !== distribution.length ||
          distribution.some(
            (item) =>
              pending.find((row) => row.saleItemId === item.saleItemId)
                ?.pendingMinor !== item.pendingMinor,
          )
        )
          throw new BadRequestException(
            "Cambió el saldo o hay movimientos por conciliar. Actualizá la cuenta antes de continuar.",
          );
        const saleIds = [...new Set(pending.map((item) => item.saleId))].sort();
        const sales = await tx.sale.findMany({
          where: {
            id: { in: saleIds },
            organizationId: org,
            customerId: customer,
            status: "COMPLETED",
          },
          include: { customerReturns: { select: { id: true } } },
        });
        if (
          sales.length !== saleIds.length ||
          sales.some((sale) => sale.customerReturns.length)
        )
          throw new BadRequestException(
            "No se puede aumentar una deuda con devoluciones o ventas no disponibles.",
          );
        for (const sale of sales) {
          if (
            !(await tx.userBranch.findFirst({
              where: { userId: actorId, branchId: sale.branchId },
            }))
          )
            throw new ForbiddenException(
              "Sin acceso a la sucursal de la venta.",
            );
        }
        let firstId = "";
        for (const saleId of saleIds) {
          const sale = sales.find((row) => row.id === saleId)!;
          const items = distribution.filter(
            (item) =>
              BigInt(item.amountMinor) > 0n &&
              pending.find((row) => row.saleItemId === item.saleItemId)
                ?.saleId === saleId,
          );
          if (!items.length) continue;
          const amount = items.reduce(
            (sum, item) => sum + BigInt(item.amountMinor),
            0n,
          );
          const movement = await tx.customerAccountMovement.create({
            data: {
              organizationId: org,
              branchId: sale.branchId,
              customerId: customer,
              saleId,
              actorId,
              type: "DEBIT",
              amountMinor: amount,
              clientOperationId: firstId ? undefined : input.clientOperationId,
              note: `Aumento total de deuda · ${reason}`,
              allocations: {
                kind: "MANUAL_DEBT_ADJUSTMENT",
                scope: "all",
                batchOperationId: input.clientOperationId,
                fingerprint,
                reason,
                items,
              },
            },
          });
          firstId ||= movement.id;
          await this.audit.recordInTransaction(tx, {
            organizationId: org,
            branchId: sale.branchId,
            actorId,
            entityType: "CUSTOMER_ACCOUNT",
            entityId: movement.id,
            action: "DEBT_INCREASED",
            before: { accountPendingMinor: String(input.expectedPendingMinor) },
            after: {
              accountPendingMinor: String(input.nextPendingMinor),
              saleId,
              increaseMinor: amount.toString(),
              reason,
              batchOperationId: input.clientOperationId,
              items,
            },
          });
        }
        return { id: firstId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async updatePrices(
    actorId: string,
    org: string,
    customer: string,
    saleId: string,
    fingerprint: string,
    clientOperationId: string,
  ) {
    await this.assert(actorId, org, "ACCOUNT_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.customerAccountMovement.findUnique({
          where: {
            organizationId_clientOperationId: {
              organizationId: org,
              clientOperationId,
            },
          },
        });
        if (previous) {
          if (
            previous.customerId !== customer ||
            (saleId === "all"
              ? !previous.allocations ||
                typeof previous.allocations !== "object" ||
                Array.isArray(previous.allocations) ||
                previous.allocations.scope !== "all"
              : previous.saleId !== saleId ||
                (previous.allocations &&
                  typeof previous.allocations === "object" &&
                  !Array.isArray(previous.allocations) &&
                  previous.allocations.scope === "all")) ||
            !priceAdjustments(previous.allocations).length ||
            (previous.allocations &&
              typeof previous.allocations === "object" &&
              !Array.isArray(previous.allocations) &&
              previous.allocations.kind === "MANUAL_DEBT_ADJUSTMENT")
          )
            throw new BadRequestException(
              "Identificador de operación ya utilizado.",
            );
          return { id: previous.id };
        }
        const preview = await this.pricePreview(
          tx,
          actorId,
          org,
          customer,
          saleId,
        );
        if (preview.fingerprint !== fingerprint)
          throw new BadRequestException(
            "Cambió el saldo o la referencia. Revisá nuevamente el aumento antes de confirmar.",
          );
        if (BigInt(preview.increaseMinor) <= 0n)
          throw new BadRequestException(
            "No hay aumentos pendientes para aplicar.",
          );
        let firstMovementId = "";
        const affectedSales = [
          ...new Set(preview.items.map((item) => item.saleId)),
        ].sort();
        for (const affectedSaleId of affectedSales) {
          const sale = await tx.sale.findFirstOrThrow({
            where: {
              id: affectedSaleId,
              organizationId: org,
              customerId: customer,
              status: "COMPLETED",
            },
          });
          const saleItems = preview.items.filter(
            (item) => item.saleId === affectedSaleId,
          );
          const amount = saleItems.reduce(
            (sum, item) => sum + BigInt(item.increaseMinor),
            0n,
          );
          const items = saleItems.map((item) => ({
            saleItemId: item.saleItemId,
            amountMinor: item.increaseMinor,
            unitPriceMinor: item.referencePriceMinor!,
            previousPriceMinor: item.previousPriceMinor,
            pendingMinor: item.pendingMinor,
            referenceCheckedAt: item.referenceCheckedAt?.toISOString() ?? null,
          }));
          const movement = await tx.customerAccountMovement.create({
            data: {
              organizationId: org,
              branchId: sale.branchId,
              customerId: customer,
              saleId: affectedSaleId,
              type: "DEBIT",
              amountMinor: amount,
              actorId,
              clientOperationId: firstMovementId
                ? undefined
                : clientOperationId,
              note: "Ajuste por aumento de precios · Solo saldo pendiente",
              allocations: {
                kind: "PRICE_ADJUSTMENT",
                scope: saleId === "all" ? "all" : "sale",
                batchOperationId: clientOperationId,
                items,
              },
            },
          });
          firstMovementId ||= movement.id;
          await this.audit.recordInTransaction(tx, {
            organizationId: org,
            branchId: sale.branchId,
            actorId,
            entityType: "CUSTOMER_ACCOUNT",
            entityId: movement.id,
            action: "PRICES_UPDATED",
            after: {
              saleId: affectedSaleId,
              increaseMinor: amount.toString(),
              batchOperationId: clientOperationId,
              items,
            },
          });
        }
        return { id: firstMovementId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async assignItems(
    actorId: string,
    organizationId: string,
    customerId: string,
    movementId: string,
    allocations: ItemAllocation[],
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        const movement = await tx.customerAccountMovement.findFirst({
          where: { id: movementId, organizationId, customerId },
        });
        if (!movement || readAllocations(movement.allocations).length)
          throw new BadRequestException(
            "El movimiento no está disponible para asignar artículos.",
          );
        const detail = await this.itemBalances(
          tx,
          actorId,
          organizationId,
          customerId,
        );
        let pending = new Map(
          detail.items.map((item) => [
            item.saleItemId,
            BigInt(item.pendingMinor),
          ]),
        );
        if (movement.type === "DEBIT" && movement.saleId) {
          const mixed = detail.mixedSales.find(
            (sale) => sale.saleId === movement.saleId,
          );
          if (!mixed)
            throw new BadRequestException(
              "La compra no necesita asignación inicial.",
            );
          pending = new Map(
            mixed.items.map((item) => [
              item.saleItemId,
              BigInt(item.subtotalMinor),
            ]),
          );
        } else if (movement.type !== "CREDIT" || movement.saleId)
          throw new BadRequestException("No se puede asignar este movimiento.");
        validateAllocations(allocations, Number(movement.amountMinor), pending);
        await tx.customerAccountMovement.update({
          where: { id: movement.id },
          data: { allocations: allocations.map((item) => ({ ...item })) },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          actorId,
          branchId: movement.branchId,
          entityType: "CUSTOMER_ACCOUNT",
          entityId: movement.id,
          action: "ITEMS_ASSIGNED",
          after: { allocations: allocations.map((item) => ({ ...item })) },
        });
        return { id: movement.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private balance(
    movements: { type: "DEBIT" | "CREDIT"; amountMinor: bigint }[],
  ) {
    return movements.reduce(
      (sum, item) =>
        sum + (item.type === "DEBIT" ? item.amountMinor : -item.amountMinor),
      0n,
    );
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
      throw new ForbiddenException("You do not have the required permission.");
  }
}
