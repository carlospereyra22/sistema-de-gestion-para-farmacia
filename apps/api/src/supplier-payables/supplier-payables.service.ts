import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  dueSummary,
  payableToday,
  validatePayable,
  civilDate,
  payableAmount,
  type PayableInput,
} from "./payable-rules";
import {
  allocatePayment,
  paymentMethods,
  type PaymentInput,
} from "./payment-rules";

const include = {
  payments: {
    include: { allocations: true },
    orderBy: { createdAt: "asc" as const },
  },
  supplier: { select: { name: true } },
  dues: { orderBy: { sequence: "asc" as const } },
  purchase: { include: { items: true } },
  receipt: { include: { items: true } },
} satisfies Prisma.SupplierPayableInvoiceInclude;
type Invoice = Prisma.SupplierPayableInvoiceGetPayload<{
  include: typeof include;
}>;
@Injectable()
export class SupplierPayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async access(actorId: string, organizationId: string, branchId: string) {
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
        user: { select: { active: true } },
      },
    });
    if (
      !member?.active ||
      !member.user.active ||
      !(await this.prisma.userBranch.findFirst({
        where: {
          userId: actorId,
          branchId,
          branch: { organizationId, active: true },
        },
      }))
    )
      throw new ForbiddenException(
        "No tenés acceso a esta organización o sucursal.",
      );
    return {
      member,
      codes: new Set(
        member.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.code),
        ),
      ),
    };
  }
  private present(invoice: Invoice, today = payableToday()) {
    const dues = this.outstandingDues(invoice);
    const balance = dues.reduce((sum, d) => sum + d.balanceMinor, 0n);
    const estimated = invoice.receipt
      ? invoice.receipt.items.reduce(
          (sum, i) => sum + BigInt(i.quantity) * i.unitCostMinor,
          0n,
        )
      : invoice.purchase?.items.reduce(
          (sum, i) => sum + BigInt(i.orderedQuantity) * i.unitCostMinor,
          0n,
        );
    return {
      id: invoice.id,
      branchId: invoice.branchId,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      purchaseId: invoice.purchaseId,
      receiptId: invoice.receiptId,
      purchaseReference: invoice.purchase?.reference ?? null,
      purchaseEstimatedMinor: estimated?.toString() ?? null,
      differenceMinor:
        estimated === undefined
          ? null
          : (invoice.amountMinor - estimated).toString(),
      documentType: invoice.documentType,
      pointOfSale: invoice.pointOfSale,
      documentNumber: invoice.documentNumber,
      issuedOn: invoice.issuedOn.toISOString().slice(0, 10),
      amountMinor: invoice.amountMinor.toString(),
      balanceMinor: balance.toString(),
      paidMinor: (invoice.amountMinor - balance).toString(),
      paymentStatus:
        balance === 0n
          ? "PAID"
          : balance < invoice.amountMinor
            ? "PARTIAL"
            : "PENDING",
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor.toString(),
        paidOn: p.paidOn.toISOString().slice(0, 10),
        method: p.method,
        reference: p.reference,
        createdByName: p.createdByName,
        createdAt: p.createdAt.toISOString(),
        voidedAt: p.voidedAt?.toISOString() ?? null,
        voidedByName: p.voidedByName,
        voidReason: p.voidReason,
        allocations: p.allocations.map((a) => ({
          dueId: a.dueId,
          amountMinor: a.amountMinor.toString(),
        })),
      })),
      reference: invoice.reference,
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      createdByName: invoice.createdByName,
      dues: dues.map((d) => ({
        id: d.id,
        sequence: d.sequence,
        dueOn: d.dueOn?.toISOString().slice(0, 10) ?? null,
        amountMinor: d.amountMinor.toString(),
        balanceMinor: d.balanceMinor.toString(),
      })),
      ...dueSummary(
        dues
          .filter((d) => d.balanceMinor > 0n)
          .map((d) => ({ dueOn: d.dueOn, amountMinor: d.balanceMinor })),
        today,
      ),
      ...(balance === 0n ? { dueStatus: "PAID" } : {}),
    };
  }
  private outstandingDues(invoice: Invoice) {
    return invoice.dues.map((d) => ({
      ...d,
      balanceMinor:
        d.amountMinor -
        invoice.payments
          .filter((p) => !p.voidedAt)
          .flatMap((p) => p.allocations)
          .filter((a) => a.dueId === d.id)
          .reduce((sum, a) => sum + a.amountMinor, 0n),
    }));
  }
  async pay(
    actor: string,
    org: string,
    branch: string,
    invoiceId: string,
    input: PaymentInput,
  ) {
    const { codes, member } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_MANAGE"))
      throw new ForbiddenException("No tenés permiso para registrar pagos.");
    const amount = payableAmount(input.amountMinor),
      expected = payableAmount(input.expectedBalanceMinor),
      paidOn = civilDate(input.paidOn);
    if (
      input.paidOn > payableToday() ||
      !paymentMethods.includes(
        input.method as (typeof paymentMethods)[number],
      ) ||
      (input.reference?.length ?? 0) > 160
    )
      throw new BadRequestException(
        "Revisá fecha, medio y referencia del pago.",
      );
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ invoiceId, ...input }))
      .digest("hex");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payable-payment:${org}:${input.operationId}`},0))::text`;
        const previous = await tx.supplierPayablePayment.findUnique({
          where: {
            organizationId_operationId: {
              organizationId: org,
              operationId: input.operationId,
            },
          },
        });
        if (previous) {
          if (
            previous.branchId !== branch ||
            previous.requestHash !== requestHash
          )
            throw new ConflictException(
              "La solicitud de pago ya se usó con otros datos.",
            );
          return { id: previous.id };
        }
        await tx.$queryRaw`SELECT id FROM "SupplierPayableInvoice" WHERE id=${invoiceId}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
        const invoice = await tx.supplierPayableInvoice.findFirst({
          where: { id: invoiceId, organizationId: org, branchId: branch },
          include,
        });
        if (!invoice) throw new NotFoundException("Deuda no disponible.");
        if (paidOn < invoice.issuedOn)
          throw new BadRequestException(
            "La fecha de pago no puede ser anterior a la deuda.",
          );
        const dues = this.outstandingDues(invoice);
        const balance = dues.reduce((sum, d) => sum + d.balanceMinor, 0n);
        if (balance !== expected)
          throw new ConflictException({
            code: "BALANCE_CHANGED",
            message:
              "El saldo cambió. Actualizá la deuda antes de confirmar otro pago.",
          });
        const allocations = allocatePayment(dues, amount);
        const payment = await tx.supplierPayablePayment.create({
          data: {
            invoiceId,
            organizationId: org,
            branchId: branch,
            operationId: input.operationId,
            requestHash,
            amountMinor: amount,
            paidOn,
            method: input.method,
            reference: input.reference?.trim() || null,
            createdById: actor,
            createdByName:
              member.displayName || "Usuario sin nombre configurado",
          },
        });
        await tx.supplierPayableAllocation.createMany({
          data: allocations.map((a) => ({
            ...a,
            invoiceId,
            paymentId: payment.id,
          })),
        });
        await this.audit.recordInTransaction(tx, {
          organizationId: org,
          branchId: branch,
          actorId: actor,
          entityType: "SUPPLIER_PAYABLE_PAYMENT",
          entityId: payment.id,
          action: "PAYMENT_RECORDED",
          after: {
            invoiceId,
            ...input,
            allocations: allocations.map((a) => ({
              ...a,
              amountMinor: a.amountMinor.toString(),
            })),
            balanceMinor: (balance - amount).toString(),
          },
        });
        return { id: payment.id };
      },
      { timeout: 15000 },
    );
  }
  async voidPayment(
    actor: string,
    org: string,
    branch: string,
    invoiceId: string,
    paymentId: string,
    reason: string,
  ) {
    const { codes, member } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_MANAGE"))
      throw new ForbiddenException("No tenés permiso para anular pagos.");
    if (reason.trim().length < 3 || reason.length > 300)
      throw new BadRequestException("Indicá un motivo de 3 a 300 caracteres.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SupplierPayableInvoice" WHERE id=${invoiceId}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
      const payment = await tx.supplierPayablePayment.findFirst({
        where: {
          id: paymentId,
          invoiceId,
          organizationId: org,
          branchId: branch,
        },
      });
      if (!payment) throw new NotFoundException("Pago no disponible.");
      if (payment.voidedAt) return { id: payment.id };
      await tx.supplierPayablePayment.update({
        where: { id: payment.id },
        data: {
          voidedAt: new Date(),
          voidedById: actor,
          voidedByName: member.displayName || "Usuario sin nombre configurado",
          voidReason: reason.trim(),
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId: org,
        branchId: branch,
        actorId: actor,
        entityType: "SUPPLIER_PAYABLE_PAYMENT",
        entityId: payment.id,
        action: "PAYMENT_VOIDED",
        after: {
          invoiceId,
          reason: reason.trim(),
          amountMinor: payment.amountMinor.toString(),
        },
      });
      return { id: payment.id };
    });
  }
  async options(actor: string, org: string, branch: string) {
    const { codes } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_READ"))
      throw new ForbiddenException(
        "No tenés permiso para consultar cuentas por pagar.",
      );
    const [suppliers, purchases] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { organizationId: org, active: true },
        select: {
          id: true,
          name: true,
          accountEnabled: true,
          accountTermDays: true,
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.purchase.findMany({
        where: { organizationId: org, branchId: branch },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      canCreate: codes.has("PAYABLE_MANAGE"),
      today: payableToday(),
      suppliers,
      purchases: purchases.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        reference: p.reference,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        amountMinor: p.items
          .reduce(
            (sum, i) => sum + BigInt(i.orderedQuantity) * i.unitCostMinor,
            0n,
          )
          .toString(),
      })),
    };
  }
  async list(
    actor: string,
    org: string,
    branch: string,
    query: {
      search?: string;
      supplierId?: string;
      due?: string;
      page?: string;
      payment?: string;
    },
  ) {
    const { codes } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_READ"))
      throw new ForbiddenException(
        "No tenés permiso para consultar cuentas por pagar.",
      );
    if (
      query.due &&
      !["ALL", "OVERDUE", "TODAY", "NEXT7", "NEXT30", "UNDATED"].includes(
        query.due,
      )
    )
      throw new BadRequestException("Filtro de vencimiento inválido.");
    const today = payableToday();
    const all = (
      await this.prisma.supplierPayableInvoice.findMany({
        where: { organizationId: org, branchId: branch },
        include,
        orderBy: { createdAt: "desc" },
      })
    ).map((i) => this.present(i, today));
    const search = (query.search ?? "").trim().toLocaleLowerCase("es-AR");
    const filtered = all
      .filter(
        (i) =>
          (!query.supplierId || i.supplierId === query.supplierId) &&
          (!query.payment ||
            query.payment === "ALL" ||
            (query.payment === "OPEN"
              ? i.paymentStatus !== "PAID"
              : i.paymentStatus === query.payment)) &&
          `${i.supplierName} ${i.pointOfSale}-${i.documentNumber} ${i.reference ?? ""}`
            .toLocaleLowerCase("es-AR")
            .includes(search) &&
          (!query.due ||
            query.due === "ALL" ||
            (query.due === "OVERDUE" && BigInt(i.overdueMinor) > 0n) ||
            (query.due === "TODAY" && BigInt(i.todayMinor) > 0n) ||
            (query.due === "NEXT7" && BigInt(i.next7Minor) > 0n) ||
            (query.due === "NEXT30" && BigInt(i.next30Minor) > 0n) ||
            (query.due === "UNDATED" &&
              i.nextDueOn === null &&
              i.balanceMinor !== "0")),
      )
      .sort(
        (a, b) =>
          (a.nextDueOn ?? "9999-12-31").localeCompare(
            b.nextDueOn ?? "9999-12-31",
          ) ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
    const pages = Math.max(1, Math.ceil(filtered.length / 10)),
      requested = Number(query.page ?? 1);
    if (!Number.isSafeInteger(requested) || requested < 1)
      throw new BadRequestException("Página inválida.");
    const page = Math.min(requested, pages);
    return {
      today,
      items: filtered.slice((page - 1) * 10, page * 10),
      total: filtered.length,
      page,
      pages,
      canCreate: codes.has("PAYABLE_MANAGE"),
      totalMinor: filtered
        .reduce((sum, i) => sum + BigInt(i.balanceMinor), 0n)
        .toString(),
      overdueMinor: filtered
        .reduce((sum, i) => sum + BigInt(i.overdueMinor), 0n)
        .toString(),
    };
  }
  async detail(actor: string, org: string, branch: string, id: string) {
    const { codes } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_READ"))
      throw new ForbiddenException(
        "No tenés permiso para consultar cuentas por pagar.",
      );
    const invoice = await this.prisma.supplierPayableInvoice.findFirst({
      where: { id, organizationId: org, branchId: branch },
      include,
    });
    if (!invoice) throw new NotFoundException("Factura no disponible.");
    return this.present(invoice);
  }
  async create(
    actor: string,
    org: string,
    branch: string,
    input: PayableInput,
    transaction?: Prisma.TransactionClient,
    receiptId?: string,
  ) {
    const { codes, member } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_MANAGE"))
      throw new ForbiddenException(
        "No tenés permiso para registrar facturas de proveedores.",
      );
    const valid = validatePayable(input);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    try {
      const write = async (tx: Prisma.TransactionClient) => {
        if (input.purchaseId)
          await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${input.purchaseId}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payable:${org}:${input.operationId}`},0))::text`;
        const previous = await tx.supplierPayableInvoice.findUnique({
          where: {
            organizationId_operationId: {
              organizationId: org,
              operationId: input.operationId,
            },
          },
        });
        if (previous) {
          if (
            previous.branchId !== branch ||
            previous.receiptId !== (receiptId ?? null) ||
            previous.requestHash !== requestHash
          )
            throw new ConflictException(
              "Esta solicitud ya fue registrada con otros datos.",
            );
          return { id: previous.id };
        }
        if (
          !(await tx.supplier.findFirst({
            where: {
              id: input.supplierId,
              organizationId: org,
              active: true,
            },
          }))
        )
          throw new BadRequestException("El proveedor no está disponible.");
        if (
          input.purchaseId &&
          !(await tx.purchase.findFirst({
            where: {
              id: input.purchaseId,
              organizationId: org,
              branchId: branch,
              supplierId: input.supplierId,
            },
          }))
        )
          throw new BadRequestException(
            "La compra debe pertenecer al mismo proveedor y sucursal.",
          );
        const invoice = await tx.supplierPayableInvoice.create({
          data: {
            organizationId: org,
            branchId: branch,
            supplierId: input.supplierId,
            purchaseId: input.purchaseId ?? null,
            receiptId,
            documentType: input.documentType,
            ...valid,
            dues: { create: valid.dues },
            operationId: input.operationId,
            requestHash,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            createdById: actor,
            createdByName:
              member.displayName || "Usuario sin nombre configurado",
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId: org,
          branchId: branch,
          actorId: actor,
          entityType: "SUPPLIER_PAYABLE_INVOICE",
          entityId: invoice.id,
          action: "INVOICE_REGISTERED",
          after: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
        });
        return { id: invoice.id };
      };
      return transaction
        ? await write(transaction)
        : await this.prisma.$transaction(write, { timeout: 15000 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException({
          message:
            "Ya existe un comprobante con ese proveedor, tipo y número. Revisá las facturas registradas.",
          code: "DUPLICATE_DOCUMENT",
        });
      throw error;
    }
  }
}
