import { rangoDeHistorial } from "../common/db/rango-historial";
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
import { customerAccountActors } from "./customer-account-actors";
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
import { sesionReal } from "../cash/offline-cash";
import { verificarOperacionDeOtro } from "../sales/operacion-firmada";
import {
  contextoSinConexion,
  guardarOperacionSinConexion,
  operacionYaRegistrada,
  type ContextoSinConexion,
} from "../common/offline/registro-sin-conexion";
import {
  KIND_CUENTA,
  aumentoPorPrecio,
  aumentoSinConexion,
  renglonesDe,
  repartir,
  resolverImputaciones,
  type AjusteSinConexion,
  type DestinoSinConexion,
  type ImputacionSinConexion,
  type OperacionCuentaSinConexion,
  type RenglonCuenta,
} from "./cuenta-sin-conexion";

/**
 * Las imputaciones de un cobro. Un cobro mixto guarda también su desglose de
 * medios de pago: asignarle artículos después no lo pierde.
 */
function conImputaciones(
  previas: Prisma.JsonValue | null,
  allocations: ItemAllocation[],
): Prisma.InputJsonValue {
  const items = allocations.map((item) => ({ ...item }));
  if (
    previas &&
    typeof previas === "object" &&
    !Array.isArray(previas) &&
    previas.kind === "MIXED_RECEIPT"
  )
    return { ...previas, items } as Prisma.InputJsonObject;
  return items;
}

function huellaAumentoTotal(
  customer: string,
  input: TotalDebtInput,
  distribution: ReturnType<typeof distributeDebtIncrease>,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        customer,
        current: input.expectedPendingMinor,
        next: input.nextPendingMinor,
        reason: input.reason.trim(),
        distribution,
      }),
    )
    .digest("hex");
}

function validarConfiguracion(
  limitMinor: number | null,
  accountTermDays?: number | null,
) {
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
}

/** Cuándo se hizo de verdad la última configuración (la sin conexión, su hora real). */
function momentoDeConfiguracion(
  registro: { createdAt: Date; after: Prisma.JsonValue | null } | null,
) {
  if (!registro) return null;
  const after = registro.after;
  if (
    after &&
    typeof after === "object" &&
    !Array.isArray(after) &&
    typeof after.occurredAt === "string"
  )
    return new Date(after.occurredAt);
  return registro.createdAt;
}

/**
 * Si un movimiento va en el resumen de cuenta impreso: ventas y cobros, no
 * anulaciones, ajustes de precio ni aumentos manuales (que sí cuentan en los
 * saldos).
 */
function seMuestraEnElResumen(movement: {
  type: string;
  saleId: string | null;
  allocations: Prisma.JsonValue | null;
}) {
  const { allocations } = movement;
  return movement.type === "CREDIT"
    ? !movement.saleId
    : Boolean(movement.saleId) &&
        !(
          allocations &&
          typeof allocations === "object" &&
          !Array.isArray(allocations) &&
          (allocations.kind === "PRICE_ADJUSTMENT" ||
            allocations.kind === "MANUAL_DEBT_ADJUSTMENT")
        );
}

type OfflineScope = {
  actorId: string;
  organizationId: string;
  branchId: string;
  customerId: string;
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(actorId: string, organizationId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    // Sin los movimientos: el saldo, la cantidad y el último pago se calculan
    // en la base; los movimientos se piden al abrir un cliente (SISTEMA-75).
    const customers = await this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    const resumen = new Map(
      (
        await this.prisma.$queryRaw<
          { customerId: string; saldo: bigint; cantidad: bigint }[]
        >`SELECT "customerId",
            COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN "amountMinor" ELSE -"amountMinor" END), 0)::bigint AS saldo,
            COUNT(*)::bigint AS cantidad
          FROM "CustomerAccountMovement"
          WHERE "organizationId" = ${organizationId}::uuid
          GROUP BY "customerId"`
      ).map((r) => [r.customerId, r]),
    );
    const ultimosPagos = new Map(
      (
        await this.prisma.$queryRaw<
          { customerId: string; amountMinor: bigint; createdAt: Date }[]
        >`SELECT DISTINCT ON ("customerId") "customerId", "amountMinor", "createdAt"
          FROM "CustomerAccountMovement"
          WHERE "organizationId" = ${organizationId}::uuid
            AND type = 'CREDIT' AND "saleId" IS NULL
          ORDER BY "customerId", "createdAt" DESC, id DESC`
      ).map((r) => [r.customerId, r]),
    );
    const actors = customerAccountActors(
      await this.prisma.auditLog.findMany({
        where: {
          organizationId,
          OR: [
            { entityType: "CUSTOMER", action: "CUSTOMER_CREATED" },
            { entityType: "CUSTOMER_ACCOUNT", action: "CREDIT_CONFIGURED" },
          ],
        },
        select: {
          entityId: true,
          actorId: true,
          action: true,
          before: true,
          after: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
    const actorIds = [...actors.values()].flatMap((actor) =>
      [actor.createdById, actor.creditEnabledById].filter(
        (id): id is string => id !== null,
      ),
    );
    const members = await this.prisma.userOrganization.findMany({
      where: { organizationId, userId: { in: [...new Set(actorIds)] } },
      select: { userId: true, displayName: true },
    });
    const nombres = new Map(members.map((m) => [m.userId, m.displayName]));
    const actorOf = (id: string | null | undefined) =>
      id ? { id, name: nombres.get(id) ?? null } : null;
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      document: customer.document,
      billingTaxId: customer.billingTaxId,
      billingPhone: customer.billingPhone,
      creditEnabled: customer.creditEnabled,
      createdBy: actorOf(actors.get(customer.id)?.createdById),
      creditEnabledBy: customer.creditEnabled
        ? actorOf(actors.get(customer.id)?.creditEnabledById)
        : null,
      active: customer.active,
      creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
      accountTermDays: customer.accountTermDays,
      balanceMinor: (resumen.get(customer.id)?.saldo ?? 0n).toString(),
      movementCount: Number(resumen.get(customer.id)?.cantidad ?? 0n),
      lastPayment: ultimosPagos.has(customer.id)
        ? {
            amountMinor: ultimosPagos.get(customer.id)!.amountMinor.toString(),
            createdAt: ultimosPagos.get(customer.id)!.createdAt,
          }
        : null,
    }));
  }
  /** Movimientos de la cuenta de un cliente, al abrirlo (SISTEMA-75). */
  async movements(actorId: string, organizationId: string, customerId: string) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("No se encontró el cliente.");
    const movements = await this.prisma.customerAccountMovement.findMany({
      where: { organizationId, customerId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        branchId: true,
        type: true,
        amountMinor: true,
        note: true,
        createdAt: true,
        paymentMethod: true,
        saleId: true,
        clientOperationId: true,
        allocations: true,
      },
    });
    return movements.map(({ allocations, ...movement }) => ({
      ...movement,
      // Para armar el estado de cuenta sin conexión (SISTEMA-78).
      showInStatement: seMuestraEnElResumen({ ...movement, allocations }),
      isPriceAdjustment: priceAdjustments(allocations).length > 0,
      isDebtAdjustment: Boolean(
        allocations &&
        typeof allocations === "object" &&
        !Array.isArray(allocations) &&
        allocations.kind === "MANUAL_DEBT_ADJUSTMENT",
      ),
      amountMinor: movement.amountMinor.toString(),
    }));
  }
  /**
   * Estado de cuenta de la sucursal. Con `customerId`, sólo ese cliente; con
   * `desde` (día de Argentina), sólo los movimientos desde ese día y el saldo
   * anterior calculado en la base (SISTEMA-78): antes se devolvía todo y la
   * PC filtraba (11,5 MB con 3.000 clientes).
   */
  async statement(
    actorId: string,
    organizationId: string,
    branchId: string,
    filtro: { customerId?: string; desde?: string } = {},
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_READ");
    const inicio = filtro.desde
      ? rangoDeHistorial({ desde: filtro.desde }).inicio
      : undefined;
    return this.prisma.$transaction(
      async (tx) => {
        const access = await tx.userBranch.findFirst({
          where: { userId: actorId, branchId, branch: { organizationId } },
        });
        if (!access)
          throw new ForbiddenException("No tenés acceso a esta sucursal.");
        const iniciales = new Map<string, bigint>();
        if (inicio)
          for (const fila of await tx.$queryRaw<
            { customerId: string; saldo: bigint }[]
          >`SELECT "customerId",
              COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN "amountMinor" ELSE -"amountMinor" END), 0)::bigint AS saldo
            FROM "CustomerAccountMovement"
            WHERE "organizationId" = ${organizationId}::uuid
              AND "branchId" = ${branchId}::uuid
              AND "createdAt" < ${inicio}
            GROUP BY "customerId"`)
            iniciales.set(fila.customerId, fila.saldo);
        const customers = await tx.customer.findMany({
          where: {
            organizationId,
            ...(filtro.customerId ? { id: filtro.customerId } : {}),
          },
          select: {
            id: true,
            name: true,
            document: true,
            billingTaxId: true,
            billingPhone: true,
            accountMovements: {
              where: {
                organizationId,
                branchId,
                ...(inicio ? { createdAt: { gte: inicio } } : {}),
              },
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
          const inicial = iniciales.get(customer.id) ?? 0n;
          let balance = inicial;
          return {
            ...customer,
            // Saldo antes del primer movimiento devuelto (con `desde`).
            openingBalanceMinor: inicial.toString(),
            movements: accountMovements.map(({ allocations, ...movement }) => {
              balance +=
                movement.type === "DEBIT"
                  ? movement.amountMinor
                  : -movement.amountMinor;
              return {
                ...movement,
                showInStatement: seMuestraEnElResumen({
                  ...movement,
                  allocations,
                }),
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
    validarConfiguracion(limitMinor, accountTermDays);
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
    sinConexion?: {
      contexto: ContextoSinConexion;
      imputaciones?: ImputacionSinConexion[];
    },
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_MANAGE");
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new BadRequestException("Ingresá un importe válido.");
    const parts = normalizeReceiptPayments(amountMinor, method, payments);
    const cashAmount =
      parts.find((part) => part.method === "CASH")?.amountMinor ?? 0;
    if (
      parts.length > 1 &&
      !allocations?.length &&
      !sinConexion?.imputaciones?.length
    )
      throw new BadRequestException(
        "Seleccioná los artículos del cobro mixto.",
      );
    const contexto = sinConexion?.contexto;
    return this.prisma.$transaction(
      async (tx) => {
        if (contexto) {
          const registrada = await operacionYaRegistrada(
            tx,
            organizationId,
            contexto,
          );
          if (registrada)
            return {
              id: registrada.entityId!,
              amountMinor: String(amountMinor),
              offlineIssues: registrada.offlineIssues,
            };
          // El cobro pudo haber llegado con conexión y la respuesta perderse.
          const enviado = clientOperationId
            ? await tx.customerAccountMovement.findUnique({
                where: {
                  organizationId_clientOperationId: {
                    organizationId,
                    clientOperationId,
                  },
                },
              })
            : null;
          if (enviado)
            return {
              id: enviado.id,
              amountMinor: enviado.amountMinor.toString(),
              offlineIssues: [],
            };
        }
        if (clientOperationId && !contexto) {
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
          !contexto &&
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
        if (contexto && cashSessionId) {
          // La caja pudo abrirse sin conexión (su id es el de la PC) y pudo
          // cerrarse antes de que llegara el cobro: la plata ya entró, así
          // que va a cobros pendientes de caja con aviso.
          cashSessionId = await sesionReal(tx, organizationId, cashSessionId);
          await lockCashSession(tx, cashSessionId);
          const sesion = await tx.cashSession.findFirst({
            where: { id: cashSessionId, closedAt: null },
          });
          const abierta = sesion
            ? await tx.cashRegister.findFirst({
                where: { id: sesion.cashRegisterId, branchId },
              })
            : null;
          if (!abierta) {
            contexto.avisos.push({
              kind: "CAJA_CERRADA",
              detail: {
                cliente: customer.name,
                motivo:
                  "La caja del cobro ya estaba cerrada: quedó en cobros pendientes de caja.",
                importeMinor: String(amountMinor),
              },
            });
            cashSessionId = undefined;
          }
        }
        if (!contexto)
          await assertCollectionSession(tx, branchId, cashSessionId);
        if (cashSessionId && !contexto) {
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
        const imputaciones = contexto ? sinConexion?.imputaciones : undefined;
        if (allocations || imputaciones?.length) {
          const detail = await this.itemBalances(
            tx,
            actorId,
            organizationId,
            customerId,
          );
          if (detail.unassignedReceipts.length && !contexto)
            throw new BadRequestException(
              "Primero asigná los cobros anteriores a sus artículos.",
            );
          const pending = new Map(
            detail.items.map((item) => [
              item.saleItemId,
              BigInt(item.pendingMinor),
            ]),
          );
          let adjustments: AjusteSinConexion[];
          if (contexto && imputaciones?.length) {
            // Sin conexión el cobro ya pasó: se imputa lo que entra y se
            // respeta el importe cobrado (cuenta-sin-conexion.ts).
            const resuelto = resolverImputaciones(imputaciones, detail.items);
            contexto.avisos.push(...resuelto.avisos);
            adjustments = resuelto.ajustes;
            if (adjustments.length && detail.mixedSales.length) {
              contexto.avisos.push({
                kind: "SALDO_DISTINTO",
                detail: {
                  cliente: customer.name,
                  motivo:
                    "Hay ventas por conciliar: el ajuste del importe no se aplicó.",
                },
              });
              adjustments = [];
            }
            allocations = resuelto.allocations;
          } else {
            adjustments = settlementAdjustments(allocations!, pending);
            if (adjustments.length && detail.mixedSales.length)
              throw new BadRequestException(
                "Conciliá las ventas antes de ajustar sus importes.",
              );
            for (const adjustment of adjustments)
              pending.set(adjustment.saleItemId, adjustment.after);
            validateAllocations(allocations!, amountMinor, pending);
          }
          adjustmentTotal = adjustments.reduce(
            (sum, item) => sum + item.delta,
            0n,
          );
          if (
            !contexto &&
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
            if ((!sale || sale.customerReturns.length) && contexto) {
              adjustmentTotal -= adjustment.delta;
              contexto.avisos.push({
                kind: "SALDO_DISTINTO",
                detail: {
                  articulo: item.name,
                  motivo:
                    "La venta tiene devoluciones: el ajuste del importe no se aplicó.",
                },
              });
              continue;
            }
            if (!sale || sale.customerReturns.length)
              throw new BadRequestException(
                "No se puede ajustar una venta con devoluciones.",
              );
            const adjustmentMovement = await tx.customerAccountMovement.create({
              data: {
                ...(contexto ? { createdAt: contexto.occurredAt } : {}),
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
            ...(contexto ? { createdAt: contexto.occurredAt } : {}),
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
              ...(contexto ? { collectedAt: contexto.occurredAt } : {}),
            },
            parts,
          );
        if (cashAmount > 0 && cashSessionId)
          await tx.cashMovement.create({
            data: {
              ...(contexto ? { createdAt: contexto.occurredAt } : {}),
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
            ...(contexto
              ? { origen: "SIN_CONEXION", deviceId: contexto.deviceId }
              : {}),
          },
        });
        if (contexto) {
          const saldo =
            this.balance(customer.accountMovements) +
            adjustmentTotal -
            BigInt(amountMinor);
          if (saldo < 0n)
            contexto.avisos.push({
              kind: "SALDO_A_FAVOR",
              detail: {
                cliente: customer.name,
                motivo: "El cobro superó la deuda: el excedente quedó a favor.",
                aFavorMinor: (-saldo).toString(),
              },
            });
          const { offlineIssues } = await guardarOperacionSinConexion(
            tx,
            contexto,
            { organizationId, branchId, actorId, entityId: movement.id },
          );
          return {
            id: movement.id,
            amountMinor: movement.amountMinor.toString(),
            offlineIssues,
          };
        }
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
      productId: string | null;
      description: string | null;
      comparable: boolean;
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
        productId: string | null;
        description: string | null;
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
            productId: item.productId,
            description: item.description,
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
          productId: item.productId,
          description: item.description,
          comparable,
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
    const fingerprint = huellaAumentoTotal(customer, input, distribution);
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
        return {
          id: await this.registrarAumentoTotal(
            tx,
            actorId,
            org,
            customer,
            input,
            distribution,
            pending,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  /** Movimientos del aumento total, uno por venta (con o sin conexión). */
  private async registrarAumentoTotal(
    tx: Prisma.TransactionClient,
    actorId: string,
    org: string,
    customer: string,
    input: TotalDebtInput,
    distribution: ReturnType<typeof distributeDebtIncrease>,
    pending: { saleItemId: string; saleId: string }[],
    sinConexion?: ContextoSinConexion,
  ) {
    const reason = input.reason.trim();
    const fingerprint = huellaAumentoTotal(customer, input, distribution);
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
        throw new ForbiddenException("Sin acceso a la sucursal de la venta.");
    }
    let firstId = "";
    for (const saleId of saleIds) {
      const sale = sales.find((row) => row.id === saleId)!;
      const items = distribution.filter(
        (item) =>
          BigInt(item.amountMinor) > 0n &&
          pending.find((row) => row.saleItemId === item.saleItemId)?.saleId ===
            saleId,
      );
      if (!items.length) continue;
      const amount = items.reduce(
        (sum, item) => sum + BigInt(item.amountMinor),
        0n,
      );
      const movement = await tx.customerAccountMovement.create({
        data: {
          ...(sinConexion ? { createdAt: sinConexion.occurredAt } : {}),
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
          ...(sinConexion
            ? { origen: "SIN_CONEXION", deviceId: sinConexion.deviceId }
            : {}),
        },
      });
    }
    return firstId;
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
        return {
          id: await this.registrarAumentoDePrecios(
            tx,
            actorId,
            org,
            customer,
            saleId,
            preview.items,
            clientOperationId,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  /** Movimientos del aumento de precios, uno por venta (con o sin conexión). */
  private async registrarAumentoDePrecios(
    tx: Prisma.TransactionClient,
    actorId: string,
    org: string,
    customer: string,
    saleId: string,
    changed: {
      saleId: string;
      saleItemId: string;
      increaseMinor: string;
      referencePriceMinor: string | null;
      previousPriceMinor: string;
      pendingMinor: string;
      referenceCheckedAt: Date | null;
    }[],
    clientOperationId: string,
    sinConexion?: ContextoSinConexion,
  ) {
    let firstMovementId = "";
    const affectedSales = [
      ...new Set(changed.map((item) => item.saleId)),
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
      const saleItems = changed.filter(
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
          ...(sinConexion ? { createdAt: sinConexion.occurredAt } : {}),
          organizationId: org,
          branchId: sale.branchId,
          customerId: customer,
          saleId: affectedSaleId,
          type: "DEBIT",
          amountMinor: amount,
          actorId,
          clientOperationId: firstMovementId ? undefined : clientOperationId,
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
          ...(sinConexion
            ? { origen: "SIN_CONEXION", deviceId: sinConexion.deviceId }
            : {}),
        },
      });
    }
    return firstMovementId;
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
          data: {
            allocations: conImputaciones(movement.allocations, allocations),
          },
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
  /**
   * Operación de cuenta corriente hecha sin conexión (SISTEMA-70), que la PC
   * manda al volver. Se registra una sola vez, con su hora real y en una sola
   * transacción con sus avisos.
   */
  async completeOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    op: OperacionCuentaSinConexion,
    reenviadaPor?: string,
  ) {
    await this.assert(actorId, organizationId, "ACCOUNT_MANAGE");
    const contexto = await contextoSinConexion(this.prisma, organizationId, {
      operationId: op.clientOperationId,
      kind: KIND_CUENTA[op.tipo],
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio: { tipo: op.tipo, customerId: op.customerId, cuerpo: op.cuerpo },
      reenviadaPor,
    });
    const scope = {
      actorId,
      organizationId,
      branchId,
      customerId: op.customerId,
    };
    switch (op.tipo) {
      case "COBRO": {
        const c = op.cuerpo;
        const recibo = await this.pay(
          actorId,
          organizationId,
          branchId,
          op.customerId,
          c.amountMinor,
          c.method,
          c.note,
          c.cashSessionId,
          op.clientOperationId,
          undefined,
          c.payments,
          { contexto, imputaciones: c.imputaciones },
        );
        return {
          entityId: recibo.id,
          offlineIssues:
            ("offlineIssues" in recibo && recibo.offlineIssues) || [],
        };
      }
      case "ASIGNACION":
        return this.assignOffline(scope, op.cuerpo, contexto);
      case "AUMENTO_DEUDA":
        return this.increaseDebtOffline(scope, op.cuerpo, contexto);
      case "AUMENTO_DEUDA_TOTAL":
        return this.increaseTotalDebtOffline(scope, op.cuerpo, contexto);
      case "ACTUALIZAR_PRECIOS":
        return this.updatePricesOffline(scope, op.cuerpo, contexto);
      case "CONFIGURAR":
        return this.configureOffline(scope, op.cuerpo, contexto);
    }
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  async completeOfflineSigned(
    senderId: string,
    organizationId: string,
    branchId: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionCuentaSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.completeOffline(senderId, organizationId, branchId, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId,
      branchId,
    });
    try {
      await this.assert(firma.actorId, organizationId, "ACCOUNT_MANAGE");
    } catch {
      throw new BadRequestException(
        "Quien hizo la operación ya no puede manejar cuentas corrientes. Revisala a mano.",
      );
    }
    return this.completeOffline(
      firma.actorId,
      organizationId,
      branchId,
      op,
      senderId,
    );
  }
  /** Ya llegó con conexión (la respuesta se perdió): no se repite. */
  private async movimientoYaEnviado(
    tx: Prisma.TransactionClient,
    organizationId: string,
    clientOperationId: string,
  ) {
    const enviado = await tx.customerAccountMovement.findUnique({
      where: {
        organizationId_clientOperationId: { organizationId, clientOperationId },
      },
      select: { id: true },
    });
    return enviado ? { entityId: enviado.id, offlineIssues: [] } : null;
  }
  private async assignOffline(
    scope: OfflineScope,
    cuerpo: { movementId: string; imputaciones: ImputacionSinConexion[] },
    contexto: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId, customerId } = scope;
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(
          tx,
          organizationId,
          contexto,
        );
        if (registrada) return registrada;
        // Una venta mixta hecha sin conexión se nombra por su id: la PC no
        // conoce el de su movimiento.
        const movement = await tx.customerAccountMovement.findFirst({
          where: {
            organizationId,
            customerId,
            OR: [
              { id: cuerpo.movementId },
              { clientOperationId: cuerpo.movementId },
              { saleId: cuerpo.movementId, type: "DEBIT" },
            ],
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (!movement)
          throw new NotFoundException("El cobro a asignar no está disponible.");
        if (readAllocations(movement.allocations).length)
          contexto.avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              motivo:
                "El cobro ya estaba asignado desde otra PC: se dejó como estaba.",
              movimientoId: movement.id,
            },
          });
        else {
          const detail = await this.itemBalances(
            tx,
            actorId,
            organizationId,
            customerId,
          );
          let renglones: RenglonCuenta[] = detail.items;
          if (movement.type === "DEBIT" && movement.saleId) {
            const mixed = detail.mixedSales.find(
              (sale) => sale.saleId === movement.saleId,
            );
            if (!mixed)
              throw new BadRequestException(
                "La compra no necesita asignación inicial.",
              );
            renglones = mixed.items.map((item) => ({
              ...item,
              saleId: mixed.saleId,
              pendingMinor: item.subtotalMinor,
            }));
          } else if (movement.type !== "CREDIT" || movement.saleId)
            throw new BadRequestException(
              "No se puede asignar este movimiento.",
            );
          // Asignar no ajusta importes: sólo reparte lo cobrado.
          const resuelto = resolverImputaciones(
            cuerpo.imputaciones.map(({ saleItemId, linea, amountMinor }) => ({
              saleItemId,
              linea,
              amountMinor,
            })),
            renglones,
          );
          contexto.avisos.push(...resuelto.avisos);
          if (resuelto.allocations.length) {
            await tx.customerAccountMovement.update({
              where: { id: movement.id },
              data: {
                allocations: conImputaciones(
                  movement.allocations,
                  resuelto.allocations,
                ),
              },
            });
            await this.audit.recordInTransaction(tx, {
              organizationId,
              actorId,
              branchId: movement.branchId,
              entityType: "CUSTOMER_ACCOUNT",
              entityId: movement.id,
              action: "ITEMS_ASSIGNED",
              after: {
                allocations: resuelto.allocations.map((item) => ({ ...item })),
                origen: "SIN_CONEXION",
                deviceId: contexto.deviceId,
              },
            });
          }
        }
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId,
          branchId,
          actorId,
          entityId: movement.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async increaseDebtOffline(
    scope: OfflineScope,
    cuerpo: {
      destino: DestinoSinConexion;
      expectedPendingMinor: number;
      nextPendingMinor: number;
      reason: string;
    },
    contexto: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId, customerId } = scope;
    const reason = cuerpo.reason.trim();
    if (
      !Number.isSafeInteger(cuerpo.expectedPendingMinor) ||
      cuerpo.expectedPendingMinor <= 0 ||
      !Number.isSafeInteger(cuerpo.nextPendingMinor) ||
      cuerpo.nextPendingMinor <= cuerpo.expectedPendingMinor ||
      reason.length < 3 ||
      reason.length > 300
    )
      throw new BadRequestException(
        "Ingresá un saldo mayor al actual y un motivo de 3 a 300 caracteres.",
      );
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(
          tx,
          organizationId,
          contexto,
        );
        if (registrada) return registrada;
        const enviado = await this.movimientoYaEnviado(
          tx,
          organizationId,
          contexto.operationId,
        );
        if (enviado) return enviado;
        const detail = await this.itemBalances(
          tx,
          actorId,
          organizationId,
          customerId,
        );
        const renglones = renglonesDe(cuerpo.destino, detail.items);
        if (!renglones.length)
          throw new BadRequestException(
            "El artículo ya no está disponible en la cuenta del cliente.",
          );
        const actual = renglones.reduce(
          (sum, row) => sum + BigInt(row.pendingMinor),
          0n,
        );
        const { delta, siguiente, cambio } = aumentoSinConexion(
          BigInt(cuerpo.expectedPendingMinor),
          BigInt(cuerpo.nextPendingMinor),
          actual,
        );
        if (cambio)
          contexto.avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              articulo: renglones[0]!.name,
              motivo:
                "El saldo cambió mientras no había conexión: el aumento se sumó sobre el saldo de hoy.",
              esperadoMinor: String(cuerpo.expectedPendingMinor),
              encontradoMinor: actual.toString(),
              aumentoMinor: delta.toString(),
            },
          });
        const sale = await tx.sale.findFirstOrThrow({
          where: {
            id: renglones[0]!.saleId,
            organizationId,
            customerId,
            status: "COMPLETED",
          },
          include: { customerReturns: { select: { id: true } } },
        });
        if (sale.customerReturns.length)
          throw new BadRequestException(
            "No se puede aumentar una deuda con devoluciones registradas.",
          );
        const partes = repartir(
          delta,
          renglones.map((row) => BigInt(row.pendingMinor)),
        );
        const items = renglones
          .map((row, i) => ({
            saleItemId: row.saleItemId,
            amountMinor: partes[i]!.toString(),
            unitPriceMinor: "0",
          }))
          .filter((item) => item.amountMinor !== "0");
        const movement = await tx.customerAccountMovement.create({
          data: {
            createdAt: contexto.occurredAt,
            organizationId,
            branchId: sale.branchId,
            customerId,
            saleId: sale.id,
            type: "DEBIT",
            amountMinor: delta,
            actorId,
            clientOperationId: contexto.operationId,
            note: `Aumento manual de deuda · ${reason}`,
            allocations: {
              kind: "MANUAL_DEBT_ADJUSTMENT",
              saleItemId: renglones[0]!.saleItemId,
              expectedPendingMinor: Number(actual),
              nextPendingMinor: Number(siguiente),
              reason,
              items,
            },
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId: sale.branchId,
          actorId,
          entityType: "CUSTOMER_ACCOUNT",
          entityId: movement.id,
          action: "DEBT_INCREASED",
          before: { pendingMinor: actual.toString() },
          after: {
            saleId: sale.id,
            saleItemId: renglones[0]!.saleItemId,
            name: renglones[0]!.name,
            pendingMinor: siguiente.toString(),
            increaseMinor: delta.toString(),
            reason,
            origen: "SIN_CONEXION",
            deviceId: contexto.deviceId,
          },
        });
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId,
          branchId,
          actorId,
          entityId: movement.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async increaseTotalDebtOffline(
    scope: OfflineScope,
    cuerpo: {
      expectedPendingMinor: number;
      nextPendingMinor: number;
      reason: string;
    },
    contexto: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId, customerId } = scope;
    const reason = cuerpo.reason.trim();
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(
          tx,
          organizationId,
          contexto,
        );
        if (registrada) return registrada;
        const enviado = await this.movimientoYaEnviado(
          tx,
          organizationId,
          contexto.operationId,
        );
        if (enviado) return enviado;
        const detail = await this.itemBalances(
          tx,
          actorId,
          organizationId,
          customerId,
        );
        const pending = detail.items.filter(
          (item) => BigInt(item.pendingMinor) > 0n,
        );
        const actual = pending.reduce(
          (sum, item) => sum + BigInt(item.pendingMinor),
          0n,
        );
        if (!pending.length)
          throw new BadRequestException(
            "El cliente ya no tiene artículos con saldo para aumentar.",
          );
        const { delta, siguiente, cambio } = aumentoSinConexion(
          BigInt(cuerpo.expectedPendingMinor),
          BigInt(cuerpo.nextPendingMinor),
          actual,
        );
        if (cambio)
          contexto.avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              motivo:
                "El saldo cambió mientras no había conexión: el aumento se sumó sobre el saldo de hoy.",
              esperadoMinor: String(cuerpo.expectedPendingMinor),
              encontradoMinor: actual.toString(),
              aumentoMinor: delta.toString(),
            },
          });
        const input = {
          expectedPendingMinor: Number(actual),
          nextPendingMinor: Number(siguiente),
          expectedItems: pending.map((item) => ({
            saleItemId: item.saleItemId,
            pendingMinor: item.pendingMinor,
          })),
          reason,
          clientOperationId: contexto.operationId,
        };
        const distribution = distributeDebtIncrease(input);
        const firstId = await this.registrarAumentoTotal(
          tx,
          actorId,
          organizationId,
          customerId,
          input,
          distribution,
          pending,
          contexto,
        );
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId,
          branchId,
          actorId,
          entityId: firstId || null,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async updatePricesOffline(
    scope: OfflineScope,
    cuerpo: {
      saleId: string;
      referencias: { productId: string; referencePriceMinor: number }[];
    },
    contexto: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId, customerId } = scope;
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(
          tx,
          organizationId,
          contexto,
        );
        if (registrada) return registrada;
        const enviado = await this.movimientoYaEnviado(
          tx,
          organizationId,
          contexto.operationId,
        );
        if (enviado) return enviado;
        const detail = await this.itemBalances(
          tx,
          actorId,
          organizationId,
          customerId,
        );
        const vistas = new Map(
          cuerpo.referencias.map((ref) => [
            ref.productId,
            BigInt(ref.referencePriceMinor),
          ]),
        );
        let referenciaCambio = false;
        // Con el precio que vio la PC, sobre lo que el cliente debe hoy: lo
        // ya cobrado no se toca.
        const changed = detail.items
          .filter(
            (item) =>
              (cuerpo.saleId === "all" || item.saleId === cuerpo.saleId) &&
              item.comparable &&
              item.productId !== null &&
              vistas.has(item.productId),
          )
          .flatMap((item) => {
            const vista = vistas.get(item.productId!)!;
            if (item.referencePriceMinor !== vista.toString())
              referenciaCambio = true;
            const increase = aumentoPorPrecio(
              BigInt(item.pendingMinor),
              BigInt(item.previousPriceMinor),
              vista,
            );
            return increase > 0n
              ? [
                  {
                    ...item,
                    increaseMinor: increase.toString(),
                    referencePriceMinor: vista.toString(),
                  },
                ]
              : [];
          });
        if (referenciaCambio)
          contexto.avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              motivo:
                "El precio de referencia cambió mientras no había conexión: se usó el que vio la PC.",
            },
          });
        let entityId: string | null = null;
        if (changed.length)
          entityId = await this.registrarAumentoDePrecios(
            tx,
            actorId,
            organizationId,
            customerId,
            cuerpo.saleId,
            changed,
            contexto.operationId,
            contexto,
          );
        else
          contexto.avisos.push({
            kind: "SALDO_DISTINTO",
            detail: {
              motivo:
                "Al sincronizar ya no había aumentos para aplicar (otra PC lo actualizó o se cobró).",
            },
          });
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId,
          branchId,
          actorId,
          entityId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async configureOffline(
    scope: OfflineScope,
    cuerpo: {
      enabled: boolean;
      creditLimitMinor: number | null;
      accountTermDays?: number | null;
    },
    contexto: ContextoSinConexion,
  ) {
    const { actorId, organizationId, branchId, customerId } = scope;
    validarConfiguracion(cuerpo.creditLimitMinor, cuerpo.accountTermDays);
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(
          tx,
          organizationId,
          contexto,
        );
        if (registrada) return registrada;
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId },
        });
        if (!customer)
          throw new NotFoundException("El cliente no está disponible.");
        // Queda el cambio más reciente: si otra PC lo configuró después de
        // esta operación, no se pisa.
        const ultima = await tx.auditLog.findFirst({
          where: {
            organizationId,
            entityType: "CUSTOMER_ACCOUNT",
            entityId: customerId,
            action: "CREDIT_CONFIGURED",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        const ultimaHora = momentoDeConfiguracion(ultima);
        if (ultimaHora && ultimaHora > contexto.occurredAt)
          contexto.avisos.push({
            kind: "CONFIGURACION_PISADA",
            detail: {
              cliente: customer.name,
              motivo:
                "Otra PC cambió la cuenta después: quedó ese cambio, que es el más reciente.",
              pedido: {
                enabled: cuerpo.enabled,
                limitMinor: cuerpo.creditLimitMinor,
                accountTermDays: cuerpo.accountTermDays ?? null,
              },
            },
          });
        else {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              creditEnabled: cuerpo.enabled,
              creditLimitMinor:
                cuerpo.creditLimitMinor === null
                  ? null
                  : BigInt(cuerpo.creditLimitMinor),
              accountTermDays: cuerpo.accountTermDays,
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
              enabled: cuerpo.enabled,
              limitMinor: cuerpo.creditLimitMinor,
              accountTermDays:
                cuerpo.accountTermDays === undefined
                  ? customer.accountTermDays
                  : cuerpo.accountTermDays,
              occurredAt: contexto.occurredAt.toISOString(),
              origen: "SIN_CONEXION",
              deviceId: contexto.deviceId,
            },
          });
        }
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId,
          branchId,
          actorId,
          entityId: customerId,
        });
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
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
