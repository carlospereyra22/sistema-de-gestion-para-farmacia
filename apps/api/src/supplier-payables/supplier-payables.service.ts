import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  contextoSinConexion,
  guardarOperacionSinConexion,
  operacionYaRegistrada,
  type ContextoSinConexion,
} from "../common/offline/registro-sin-conexion";
import { verificarOperacionDeOtro } from "../sales/operacion-firmada";
import {
  KIND_PAGAR,
  esLaMismaDeuda,
  pagoHastaElSaldo,
  type OperacionPagarSinConexion,
} from "./pagar-sin-conexion";
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
    const alcance = await this.alcanceDePago(actor, org, branch);
    return this.prisma.$transaction(
      async (tx) => {
        const { id } = await this.pagarEnTx(tx, alcance, invoiceId, input);
        // Con conexión el pago siempre se registra entero.
        return { id: id! };
      },
      { timeout: 15000 },
    );
  }
  /** Quien registra o anula pagos necesita PAYABLE_PAY y la sucursal. */
  private async alcanceDePago(
    actor: string,
    org: string,
    branch: string,
    accion = "registrar pagos",
  ): Promise<AlcancePago> {
    const { codes, member } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_PAY"))
      throw new ForbiddenException(`No tenés permiso para ${accion}.`);
    return {
      actor,
      org,
      branch,
      nombre: member.displayName || "Usuario sin nombre configurado",
    };
  }
  /**
   * Bloquea la deuda para actualizarla. Sin conexión también se la puede
   * nombrar por su clave: una cargada sin conexión o la de una recepción.
   */
  private async bloquearDeuda(
    tx: Prisma.TransactionClient,
    org: string,
    branch: string,
    referencia: string,
    porClave: boolean,
  ) {
    const encontrada = await tx.supplierPayableInvoice.findFirst({
      where: {
        organizationId: org,
        branchId: branch,
        OR: porClave
          ? [{ id: referencia }, { operationId: referencia }]
          : [{ id: referencia }],
      },
      select: { id: true },
    });
    if (!encontrada) return null;
    await tx.$queryRaw`SELECT id FROM "SupplierPayableInvoice" WHERE id=${encontrada.id}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
    return tx.supplierPayableInvoice.findUniqueOrThrow({
      where: { id: encontrada.id },
      include,
    });
  }
  /**
   * Registra el pago dentro de `tx`. Con conexión, el saldo tiene que ser el
   * que vio la pantalla. Sin conexión el pago ya se hizo: se registra hasta lo
   * que se debe al llegar y lo que sobra queda como aviso (SISTEMA-73).
   */
  private async pagarEnTx(
    tx: Prisma.TransactionClient,
    alcance: AlcancePago,
    invoiceRef: string,
    input: PaymentInput,
    contexto?: ContextoSinConexion,
  ): Promise<{ id: string | null; invoiceId: string }> {
    const { actor, org, branch } = alcance;
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
      .update(JSON.stringify({ invoiceId: invoiceRef, ...input }))
      .digest("hex");
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
      if (previous.branchId !== branch || previous.requestHash !== requestHash)
        throw new ConflictException(
          "La solicitud de pago ya se usó con otros datos.",
        );
      return { id: previous.id, invoiceId: previous.invoiceId };
    }
    const invoice = await this.bloquearDeuda(
      tx,
      org,
      branch,
      invoiceRef,
      Boolean(contexto),
    );
    if (!invoice) {
      if (contexto)
        throw new UnprocessableEntityException(
          "La deuda de este pago no está registrada en el servidor (puede haberse rechazado por estar repetida). Cargá el pago sobre la deuda que corresponde.",
        );
      throw new NotFoundException("Deuda no disponible.");
    }
    if (paidOn < invoice.issuedOn)
      throw new BadRequestException(
        "La fecha de pago no puede ser anterior a la deuda.",
      );
    const dues = this.outstandingDues(invoice);
    const balance = dues.reduce((sum, d) => sum + d.balanceMinor, 0n);
    let registrar = amount;
    if (contexto) {
      const parte = pagoHastaElSaldo(amount, balance);
      registrar = parte.registrar;
      if (parte.sobra > 0n)
        contexto.avisos.push({
          kind: "PAGO_SUPERA_SALDO",
          detail: {
            proveedor: invoice.supplier.name,
            deudaId: invoice.id,
            pagadoMinor: amount.toString(),
            registradoMinor: registrar.toString(),
            sobraMinor: parte.sobra.toString(),
            motivo:
              registrar === 0n
                ? "La deuda ya estaba saldada cuando llegó el pago: no se registró. Revisá si se cargó dos veces."
                : "El pago superaba lo que se debía cuando llegó: se registró hasta el saldo. Revisá si el resto se cargó dos veces.",
          },
        });
      if (registrar === 0n) return { id: null, invoiceId: invoice.id };
    } else if (balance !== expected)
      throw new ConflictException({
        code: "BALANCE_CHANGED",
        message:
          "El saldo cambió. Actualizá la deuda antes de confirmar otro pago.",
      });
    const allocations = allocatePayment(dues, registrar);
    const payment = await tx.supplierPayablePayment.create({
      data: {
        // Sin conexión, el pago se conoce por la clave de la PC (SISTEMA-73).
        ...(contexto
          ? { id: input.operationId, createdAt: contexto.occurredAt }
          : {}),
        invoiceId: invoice.id,
        organizationId: org,
        branchId: branch,
        operationId: input.operationId,
        requestHash,
        amountMinor: registrar,
        paidOn,
        method: input.method,
        reference: input.reference?.trim() || null,
        createdById: actor,
        createdByName: alcance.nombre,
      },
    });
    await tx.supplierPayableAllocation.createMany({
      data: allocations.map((a) => ({
        ...a,
        invoiceId: invoice.id,
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
        invoiceId: invoice.id,
        ...input,
        ...(registrar !== amount
          ? {
              amountMinor: registrar.toString(),
              pedidoMinor: amount.toString(),
            }
          : {}),
        allocations: allocations.map((a) => ({
          ...a,
          amountMinor: a.amountMinor.toString(),
        })),
        balanceMinor: (balance - registrar).toString(),
        ...origen(contexto),
      },
    });
    return { id: payment.id, invoiceId: invoice.id };
  }
  async voidPayment(
    actor: string,
    org: string,
    branch: string,
    invoiceId: string,
    paymentId: string,
    reason: string,
  ) {
    const alcance = await this.alcanceDePago(
      actor,
      org,
      branch,
      "anular pagos",
    );
    return this.prisma.$transaction(async (tx) => {
      const { id } = await this.anularEnTx(
        tx,
        alcance,
        invoiceId,
        paymentId,
        reason,
      );
      // Con conexión el pago existe siempre (si no, es un 404).
      return { id: id! };
    });
  }
  /**
   * Anula el pago dentro de `tx`. Sin conexión, si otra PC ya lo anuló, no se
   * anula otra vez: queda aviso (SISTEMA-73).
   */
  private async anularEnTx(
    tx: Prisma.TransactionClient,
    alcance: AlcancePago,
    invoiceRef: string,
    paymentRef: string,
    reason: string,
    contexto?: ContextoSinConexion,
  ): Promise<{ id: string | null; invoiceId: string | null }> {
    const { actor, org, branch } = alcance;
    if (reason.trim().length < 3 || reason.length > 300)
      throw new BadRequestException("Indicá un motivo de 3 a 300 caracteres.");
    const invoice = await this.bloquearDeuda(
      tx,
      org,
      branch,
      invoiceRef,
      Boolean(contexto),
    );
    const payment = invoice?.payments.find(
      (p) =>
        p.id === paymentRef ||
        (contexto !== undefined && p.operationId === paymentRef),
    );
    if (!payment) {
      // Un pago hecho sin conexión que no se registró (la deuda ya estaba
      // saldada): no hay nada que anular.
      if (
        contexto &&
        (await tx.offlineOperation.findFirst({
          where: { id: paymentRef, organizationId: org },
        }))
      ) {
        contexto.avisos.push({
          kind: "PAGO_YA_ANULADO",
          detail: {
            motivo:
              "El pago que se quería anular no se había registrado (la deuda ya estaba saldada): no hay nada que anular.",
          },
        });
        return { id: null, invoiceId: invoice?.id ?? null };
      }
      if (contexto)
        throw new UnprocessableEntityException(
          "El pago que se quería anular no está registrado en el servidor. Revisalo a mano.",
        );
      throw new NotFoundException("Pago no disponible.");
    }
    if (payment.voidedAt) {
      if (contexto)
        contexto.avisos.push({
          kind: "PAGO_YA_ANULADO",
          detail: {
            proveedor: invoice!.supplier.name,
            deudaId: invoice!.id,
            motivo: `Otra PC ya había anulado este pago (${payment.voidReason ?? "sin motivo"}): no se anuló otra vez.`,
          },
        });
      return { id: payment.id, invoiceId: invoice!.id };
    }
    await tx.supplierPayablePayment.update({
      where: { id: payment.id },
      data: {
        voidedAt: contexto?.occurredAt ?? new Date(),
        voidedById: actor,
        voidedByName: alcance.nombre,
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
        invoiceId: invoice!.id,
        reason: reason.trim(),
        amountMinor: payment.amountMinor.toString(),
        ...origen(contexto),
      },
    });
    return { id: payment.id, invoiceId: invoice!.id };
  }
  /**
   * Deuda, pago o anulación hecho sin conexión (SISTEMA-73), que la PC manda
   * al volver. Se registra una sola vez, con su hora real y en una sola
   * transacción con sus avisos.
   */
  async completeOffline(
    actor: string,
    org: string,
    branch: string,
    op: OperacionPagarSinConexion,
    reenviadaPor?: string,
  ) {
    const alcance = await this.alcanceSinConexion(actor, org, branch, op.tipo);
    const contexto = await contextoSinConexion(this.prisma, org, {
      operationId: op.clientOperationId,
      kind: KIND_PAGAR[op.tipo],
      occurredAt: op.occurredAt,
      deviceId: op.deviceId,
      negocio:
        op.tipo === "DEUDA"
          ? { tipo: op.tipo, cuerpo: op.cuerpo }
          : op.tipo === "PAGO"
            ? { tipo: op.tipo, invoiceId: op.invoiceId, cuerpo: op.cuerpo }
            : {
                tipo: op.tipo,
                invoiceId: op.invoiceId,
                paymentId: op.paymentId,
                cuerpo: op.cuerpo,
              },
      reenviadaPor,
    });
    return this.prisma.$transaction(
      async (tx) => {
        const registrada = await operacionYaRegistrada(tx, org, contexto);
        if (registrada) return registrada;
        const entityId =
          op.tipo === "DEUDA"
            ? (
                await this.create(
                  actor,
                  org,
                  branch,
                  op.cuerpo,
                  tx,
                  undefined,
                  contexto,
                )
              ).id
            : op.tipo === "PAGO"
              ? (
                  await this.pagarEnTx(
                    tx,
                    alcance,
                    op.invoiceId,
                    op.cuerpo,
                    contexto,
                  )
                ).invoiceId
              : (
                  await this.anularEnTx(
                    tx,
                    alcance,
                    op.invoiceId,
                    op.paymentId,
                    op.cuerpo.reason,
                    contexto,
                  )
                ).invoiceId;
        return guardarOperacionSinConexion(tx, contexto, {
          organizationId: org,
          branchId: branch,
          actorId: actor,
          entityId,
        });
      },
      { timeout: 15000 },
    );
  }
  /** Permiso de la operación: cargar deudas o pagar. */
  private async alcanceSinConexion(
    actor: string,
    org: string,
    branch: string,
    tipo: OperacionPagarSinConexion["tipo"],
  ): Promise<AlcancePago> {
    if (tipo !== "DEUDA") return this.alcanceDePago(actor, org, branch);
    const { codes, member } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_MANAGE"))
      throw new ForbiddenException(
        "No tenés permiso para registrar facturas de proveedores.",
      );
    return {
      actor,
      org,
      branch,
      nombre: member.displayName || "Usuario sin nombre configurado",
    };
  }
  /** La de otro usuario de esta PC: queda a nombre de quien la hizo. */
  async completeOfflineSigned(
    senderId: string,
    org: string,
    branch: string,
    firma: {
      actorId: string;
      deviceId: string;
      payload: string;
      signature: string;
    },
    op: OperacionPagarSinConexion,
  ) {
    if (firma.actorId === senderId)
      return this.completeOffline(senderId, org, branch, op);
    await verificarOperacionDeOtro(this.prisma, {
      ...firma,
      senderId,
      organizationId: org,
      branchId: branch,
    });
    try {
      await this.alcanceSinConexion(firma.actorId, org, branch, op.tipo);
    } catch {
      throw new BadRequestException(
        "Quien hizo la operación ya no puede manejar cuentas por pagar. Revisala a mano.",
      );
    }
    return this.completeOffline(firma.actorId, org, branch, op, senderId);
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
      // El importe estimado se suma en la base (SISTEMA-74): traer todos los
      // renglones de todas las compras tardaba segundos con miles de compras.
      this.prisma.$queryRaw<
        {
          id: string;
          supplierId: string;
          reference: string | null;
          status: string;
          createdAt: Date;
          amountMinor: bigint;
        }[]
      >(Prisma.sql`
        SELECT p.id, p."supplierId", p.reference, p.status::text AS status, p."createdAt",
          COALESCE(SUM(i."orderedQuantity"::bigint * i."unitCostMinor"), 0)::bigint AS "amountMinor"
        FROM "Purchase" p
        LEFT JOIN "PurchaseItem" i ON i."purchaseId" = p.id
        WHERE p."organizationId" = ${org}::uuid AND p."branchId" = ${branch}::uuid
        GROUP BY p.id
        ORDER BY p."createdAt" DESC`),
    ]);
    return {
      canCreate: codes.has("PAYABLE_MANAGE"),
      canPay: codes.has("PAYABLE_PAY"),
      today: payableToday(),
      suppliers,
      purchases: purchases.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        reference: p.reference,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        amountMinor: p.amountMinor.toString(),
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
      canPay: codes.has("PAYABLE_PAY"),
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
  /**
   * Copia de las deudas de la sucursal para usar Cuentas por pagar sin
   * conexión (SISTEMA-73): todas las que tienen saldo y las últimas saldadas,
   * con sus vencimientos y pagos. La PC filtra y pagina con la misma lógica.
   */
  async baseLocal(actor: string, org: string, branch: string) {
    const { codes } = await this.access(actor, org, branch);
    if (!codes.has("PAYABLE_READ"))
      throw new ForbiddenException(
        "No tenés permiso para consultar cuentas por pagar.",
      );
    const today = payableToday();
    const todas = (
      await this.prisma.supplierPayableInvoice.findMany({
        where: { organizationId: org, branchId: branch },
        include,
        orderBy: { createdAt: "desc" },
      })
    ).map((i) => this.present(i, today));
    const conSaldo = todas.filter((i) => i.balanceMinor !== "0");
    const saldadas = todas
      .filter((i) => i.balanceMinor === "0")
      .slice(0, SALDADAS_EN_COPIA);
    return {
      today,
      canCreate: codes.has("PAYABLE_MANAGE"),
      canPay: codes.has("PAYABLE_PAY"),
      items: [...conSaldo, ...saldadas],
    };
  }
  async create(
    actor: string,
    org: string,
    branch: string,
    input: PayableInput,
    transaction?: Prisma.TransactionClient,
    receiptId?: string,
    contexto?: ContextoSinConexion,
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
        // Sin conexión, la compra puede nombrarse por su clave: un pedido
        // hecho sin conexión (SISTEMA-73).
        const purchaseId =
          input.purchaseId && contexto
            ? ((
                await tx.purchase.findFirst({
                  where: {
                    organizationId: org,
                    branchId: branch,
                    OR: [
                      { id: input.purchaseId },
                      { clientOperationId: input.purchaseId },
                    ],
                  },
                  select: { id: true },
                })
              )?.id ?? input.purchaseId)
            : input.purchaseId;
        if (purchaseId)
          await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${purchaseId}::uuid AND "organizationId"=${org}::uuid AND "branchId"=${branch}::uuid FOR UPDATE`;
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
        const supplier = await tx.supplier.findFirst({
          where: {
            id: input.supplierId,
            organizationId: org,
            ...(contexto ? {} : { active: true }),
          },
        });
        if (!supplier)
          throw new BadRequestException("El proveedor no está disponible.");
        if (!supplier.active)
          contexto?.avisos.push({
            kind: "PROVEEDOR_INACTIVO",
            detail: {
              proveedor: supplier.name,
              motivo:
                "El proveedor estaba dado de baja cuando llegó la deuda: se registró igual. Restauralo si sigue operando.",
            },
          });
        if (
          purchaseId &&
          !(await tx.purchase.findFirst({
            where: {
              id: purchaseId,
              organizationId: org,
              branchId: branch,
              supplierId: input.supplierId,
            },
          }))
        )
          throw new BadRequestException(
            "La compra debe pertenecer al mismo proveedor y sucursal.",
          );
        let documentKey = valid.documentKey;
        if (contexto && documentKey) {
          // Otra PC cargó el mismo comprobante (SISTEMA-73, decisión del
          // usuario): si es exactamente la misma deuda no se registra otra
          // vez; si cambia algo, se registra sin bloquear el número y se avisa.
          const repetida = await tx.supplierPayableInvoice.findFirst({
            where: {
              organizationId: org,
              supplierId: input.supplierId,
              documentType: input.documentType,
              documentKey,
            },
            include: { dues: true },
          });
          if (repetida && esLaMismaDeuda(repetida, valid))
            throw new UnprocessableEntityException({
              code: "DUPLICATE_DOCUMENT",
              message:
                "Esta deuda ya estaba registrada exactamente igual (mismo comprobante, emisión, importe y vencimientos): no se cargó dos veces.",
            });
          if (repetida) {
            documentKey = null;
            contexto.avisos.push({
              kind: "COMPROBANTE_REPETIDO",
              detail: {
                proveedor: supplier.name,
                deudaId: input.operationId,
                existenteId: repetida.id,
                comprobante: `${valid.pointOfSale ? `${valid.pointOfSale}-` : ""}${valid.documentNumber}`,
                motivo:
                  "Ese comprobante ya estaba cargado con otros datos: la deuda se registró igual. Revisá las dos y unificalas.",
              },
            });
          }
        }
        const invoice = await tx.supplierPayableInvoice.create({
          data: {
            // Sin conexión, la deuda se conoce por la clave de la PC.
            ...(contexto
              ? { id: input.operationId, createdAt: contexto.occurredAt }
              : {}),
            organizationId: org,
            branchId: branch,
            supplierId: input.supplierId,
            purchaseId: purchaseId ?? null,
            receiptId,
            documentType: input.documentType,
            ...valid,
            documentKey,
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
          after: {
            ...(JSON.parse(JSON.stringify(input)) as Record<
              string,
              Prisma.InputJsonValue
            >),
            ...origen(contexto),
          },
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

type AlcancePago = {
  actor: string;
  org: string;
  branch: string;
  /** Nombre de quien opera, como queda en el pago. */
  nombre: string;
};

/** Saldadas que van en la copia de la PC; las que tienen saldo van todas. */
export const SALDADAS_EN_COPIA = 100;

/** Marca de auditoría de lo que se hizo sin conexión. */
function origen(contexto?: ContextoSinConexion) {
  return contexto
    ? {
        origen: "SIN_CONEXION",
        deviceId: contexto.deviceId,
        occurredAt: contexto.occurredAt.toISOString(),
      }
    : {};
}
