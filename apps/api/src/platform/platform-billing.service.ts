import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";
import {
  commercialToday,
  resolveSubscriptionAccess,
} from "./subscription-access";
import { monthlyFeeMinor } from "./subscription-fee";
import {
  addDays,
  chargePeriod,
  nextChargeAction,
  settleLedger,
} from "./subscription-ledger";

const RUN_EVERY_MS = 6 * 60 * 60 * 1000;
/** El cargo aparece unos días antes de empezar el mes, para poder avisar y cobrar. */
const CHARGE_LEAD_DAYS = 5;
const MAX_CHARGES_PER_RUN = 24;
const RECENT_PAYMENTS = 200;
const BLOCKED_PERIOD_REASON = "Sin servicio: la farmacia estaba bloqueada.";

export type PaymentInput = {
  operationId: string;
  amountMinor: string;
  paidOn: string;
  method: string;
  reference?: string;
};

const civilDate = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

type LedgerRows = {
  charges: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    amountMinor: bigint;
    waivedAt: Date | null;
  }[];
  payments: { amountMinor: bigint; voidedAt: Date | null }[];
};

function settle({ charges, payments }: LedgerRows) {
  return settleLedger(
    charges.map((charge) => ({
      id: charge.id,
      periodStart: civilDate(charge.periodStart),
      periodEnd: civilDate(charge.periodEnd),
      amountMinor: charge.amountMinor,
      waived: !!charge.waivedAt,
    })),
    payments.map(({ amountMinor, voidedAt }) => ({
      amountMinor,
      voided: !!voidedAt,
    })),
  );
}

@Injectable()
export class PlatformBillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformBillingService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Los comandos de servidor arrancan la app sin el temporizador.
    if (process.env.SUBSCRIPTION_SCHEDULER === "off") return;
    void this.run();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Corre al arrancar, así se pone al día si la API estuvo apagada. */
  private async run() {
    try {
      const created = await this.generateDueCharges(new Date());
      if (created) this.logger.log(`Cargos generados: ${created}.`);
    } catch (cause) {
      this.logger.error(
        "No se pudieron generar los cargos de las suscripciones.",
        cause instanceof Error ? cause.stack : undefined,
      );
    }
    this.timer = setTimeout(() => void this.run(), RUN_EVERY_MS);
  }

  /** Idempotente: el índice único por período impide duplicar un cargo. */
  async generateDueCharges(now: Date): Promise<number> {
    const subscriptions = await this.prisma.organizationSubscription.findMany({
      where: { exempt: false, cancelledAt: null, suspendedAt: null },
      select: { organizationId: true },
    });
    let created = 0;
    for (const { organizationId } of subscriptions) {
      // Un dato malo en una farmacia no puede dejar sin cargos a las demás.
      try {
        const result = await this.prisma.$transaction((tx) =>
          this.syncLedger(tx, organizationId, now),
        );
        created += result.created;
      } catch (cause) {
        this.logger.error(
          `No se pudieron generar los cargos de ${organizationId}.`,
          cause instanceof Error ? cause.stack : undefined,
        );
      }
    }
    return created;
  }

  /**
   * Genera lo que falte y recalcula `paidThrough`. Corre también dentro de cada pago:
   * pagar reactiva al instante, sin esperar al proceso programado.
   */
  private async syncLedger(
    tx: Prisma.TransactionClient,
    organizationId: string,
    now: Date,
  ) {
    await this.lock(tx, organizationId);
    const subscription = await tx.organizationSubscription.findUniqueOrThrow({
      where: { organizationId },
      include: { plan: true },
    });
    // Toda farmacia no exenta nace con fecha de fin de prueba.
    if (subscription.exempt || !subscription.trialEndsAt)
      return { created: 0, paidThrough: subscription.paidThrough };
    const charges: LedgerRows["charges"] = await tx.subscriptionCharge.findMany(
      {
        where: { organizationId },
        orderBy: { periodStart: "asc" },
      },
    );
    const payments = await tx.subscriptionPayment.findMany({
      where: { organizationId },
    });
    const anchor = charges[0]
      ? civilDate(charges[0].periodStart)
      : addDays(civilDate(subscription.trialEndsAt), 1);
    const today = commercialToday(now);
    const limit = addDays(today, CHARGE_LEAD_DAYS);
    let created = 0;
    while (created < MAX_CHARGES_PER_RUN) {
      const period = chargePeriod(anchor, charges.length);
      if (period.periodStart > limit) break;
      const { balanceMinor, paidThrough } = settle({ charges, payments });
      const { stage } = resolveSubscriptionAccess(
        {
          ...subscription,
          paidThrough: paidThrough ? asDate(paidThrough) : null,
        },
        now,
      );
      const action = nextChargeAction({
        blocked: stage === "BLOCKED",
        hasCharges: charges.length > 0,
        balanceMinor,
        periodEnd: period.periodEnd,
        today,
      });
      if (action === "STOP") break;
      const waived = action === "WAIVE";
      charges.push(
        await tx.subscriptionCharge.create({
          data: {
            organizationId,
            periodStart: asDate(period.periodStart),
            periodEnd: asDate(period.periodEnd),
            amountMinor: monthlyFeeMinor(subscription.plan, subscription),
            waivedAt: waived ? now : null,
            waiveReason: waived ? BLOCKED_PERIOD_REASON : null,
            breakdown: {
              baseMinor: subscription.plan.baseMinor.toString(),
              extraUserMinor: subscription.plan.extraUserMinor.toString(),
              extraBranchMinor: subscription.plan.extraBranchMinor.toString(),
              extraUsers: subscription.extraUsers,
              extraBranches: subscription.extraBranches,
              agreedPriceMinor:
                subscription.agreedPriceMinor?.toString() ?? null,
            },
          },
        }),
      );
      created += 1;
    }
    const { paidThrough } = settle({ charges, payments });
    const value = paidThrough ? asDate(paidThrough) : null;
    await tx.organizationSubscription.update({
      where: { organizationId },
      data: { paidThrough: value },
    });
    return { created, paidThrough: value };
  }

  async ledger(organizationId: string) {
    const [charges, payments] = await Promise.all([
      this.prisma.subscriptionCharge.findMany({
        where: { organizationId },
        orderBy: { periodStart: "desc" },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { organizationId },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
      }),
    ]);
    const settled = settle({ charges, payments });
    const byId = new Map(settled.charges.map((item) => [item.id, item]));
    return {
      // La web la usa de tope: el día comercial cambia a las 06:00, no a medianoche.
      today: commercialToday(new Date()),
      balanceMinor: settled.balanceMinor.toString(),
      creditMinor: settled.creditMinor.toString(),
      charges: charges.map((charge) => ({
        id: charge.id,
        periodStart: civilDate(charge.periodStart),
        periodEnd: civilDate(charge.periodEnd),
        amountMinor: charge.amountMinor.toString(),
        paidMinor: (byId.get(charge.id)?.paidMinor ?? 0n).toString(),
        balanceMinor: (byId.get(charge.id)?.balanceMinor ?? 0n).toString(),
        waived: !!charge.waivedAt,
        waiveReason: charge.waiveReason,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amountMinor: payment.amountMinor.toString(),
        paidOn: civilDate(payment.paidOn),
        method: payment.method,
        reference: payment.reference,
        voided: !!payment.voidedAt,
        voidReason: payment.voidReason,
      })),
    };
  }

  /** Saldo de cada farmacia, para la lista: una consulta por tabla, no por farmacia. */
  async balances(): Promise<Map<string, bigint>> {
    const [charges, payments] = await Promise.all([
      this.prisma.subscriptionCharge.findMany({
        select: {
          id: true,
          organizationId: true,
          periodStart: true,
          periodEnd: true,
          amountMinor: true,
          waivedAt: true,
        },
      }),
      this.prisma.subscriptionPayment.findMany({
        select: { organizationId: true, amountMinor: true, voidedAt: true },
      }),
    ]);
    const rows = new Map<string, LedgerRows>();
    const rowsOf = (organizationId: string) => {
      const row = rows.get(organizationId) ?? { charges: [], payments: [] };
      rows.set(organizationId, row);
      return row;
    };
    for (const charge of charges)
      rowsOf(charge.organizationId).charges.push(charge);
    for (const payment of payments)
      rowsOf(payment.organizationId).payments.push(payment);
    return new Map(
      [...rows].map(([id, row]) => [id, settle(row).balanceMinor]),
    );
  }

  /** Lo último cobrado a todas las farmacias y lo que entró en el mes en curso. */
  async recentPayments() {
    const monthStart = `${commercialToday(new Date()).slice(0, 7)}-01`;
    const [payments, collected] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        take: RECENT_PAYMENTS,
        include: { organization: { select: { name: true } } },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { voidedAt: null, paidOn: { gte: asDate(monthStart) } },
        _sum: { amountMinor: true },
      }),
    ]);
    return {
      collectedThisMonthMinor: (collected._sum.amountMinor ?? 0n).toString(),
      payments: payments.map((payment) => ({
        id: payment.id,
        organizationId: payment.organizationId,
        organizationName: payment.organization.name,
        amountMinor: payment.amountMinor.toString(),
        paidOn: civilDate(payment.paidOn),
        method: payment.method,
        reference: payment.reference,
        voided: !!payment.voidedAt,
        voidReason: payment.voidReason,
      })),
    };
  }

  async registerPayment(
    actorId: string,
    organizationId: string,
    input: PaymentInput,
  ) {
    const amountMinor = BigInt(input.amountMinor);
    if (amountMinor <= 0n)
      throw new BadRequestException("Ingresá un importe mayor a cero.");
    if (input.paidOn > commercialToday(new Date()))
      throw new BadRequestException("La fecha del pago no puede ser futura.");
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify([
          organizationId,
          input.amountMinor,
          input.paidOn,
          input.method,
          input.reference?.trim() || null,
        ]),
      )
      .digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const { exempt } = await tx.organizationSubscription.findUniqueOrThrow({
        where: { organizationId },
      });
      if (exempt)
        throw new ConflictException("Esta farmacia está exenta de pago.");
      const previous = await tx.subscriptionPayment.findUnique({
        where: {
          organizationId_operationId: {
            organizationId,
            operationId: input.operationId,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ConflictException(
            "Este pago ya fue registrado con otros datos.",
          );
        return { id: previous.id };
      }
      const payment = await tx.subscriptionPayment.create({
        data: {
          organizationId,
          operationId: input.operationId,
          requestHash,
          amountMinor,
          paidOn: asDate(input.paidOn),
          method: input.method,
          reference: input.reference?.trim() || null,
          createdById: actorId,
        },
      });
      const { paidThrough } = await this.syncLedger(
        tx,
        organizationId,
        new Date(),
      );
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_PAYMENT_REGISTERED",
        entityType: "SubscriptionPayment",
        entityId: payment.id,
        organizationId,
        after: {
          amountMinor: input.amountMinor,
          paidOn: input.paidOn,
          method: input.method,
          paidThrough,
        },
      });
      return { id: payment.id };
    });
  }

  async voidPayment(
    actorId: string,
    organizationId: string,
    paymentId: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const payment = await tx.subscriptionPayment.findFirst({
        where: { id: paymentId, organizationId },
      });
      if (!payment) throw new NotFoundException("Pago no encontrado.");
      if (payment.voidedAt)
        throw new ConflictException("Este pago ya estaba anulado.");
      await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: reason.trim(),
        },
      });
      const { paidThrough } = await this.syncLedger(
        tx,
        organizationId,
        new Date(),
      );
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_PAYMENT_VOIDED",
        entityType: "SubscriptionPayment",
        entityId: paymentId,
        organizationId,
        before: { amountMinor: payment.amountMinor.toString() },
        after: { reason: reason.trim(), paidThrough },
      });
      return { id: paymentId };
    });
  }

  async waiveCharge(
    actorId: string,
    organizationId: string,
    chargeId: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const charge = await tx.subscriptionCharge.findFirst({
        where: { id: chargeId, organizationId },
      });
      if (!charge) throw new NotFoundException("Cargo no encontrado.");
      if (charge.waivedAt)
        throw new ConflictException("Este cargo ya estaba condonado.");
      await tx.subscriptionCharge.update({
        where: { id: chargeId },
        data: {
          waivedAt: new Date(),
          waivedById: actorId,
          waiveReason: reason.trim(),
        },
      });
      const { paidThrough } = await this.syncLedger(
        tx,
        organizationId,
        new Date(),
      );
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_CHARGE_WAIVED",
        entityType: "SubscriptionCharge",
        entityId: chargeId,
        organizationId,
        before: { amountMinor: charge.amountMinor.toString() },
        after: { reason: reason.trim(), paidThrough },
      });
      return { id: chargeId };
    });
  }

  /** Mientras dure, la farmacia no se corta. Sirve para fuerza mayor y para cuotas. */
  async extend(
    actorId: string,
    organizationId: string,
    input: { until: string | null; reason: string },
  ) {
    if (input.until && input.until < commercialToday(new Date()))
      throw new BadRequestException(
        "La prórroga no puede terminar en el pasado.",
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const before = await tx.organizationSubscription.findUniqueOrThrow({
        where: { organizationId },
      });
      await tx.organizationSubscription.update({
        where: { organizationId },
        data: {
          extendedUntil: input.until ? asDate(input.until) : null,
          extendedReason: input.until ? input.reason.trim() : null,
        },
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: input.until
          ? "PLATFORM_EXTENSION_GRANTED"
          : "PLATFORM_EXTENSION_REMOVED",
        entityType: "OrganizationSubscription",
        entityId: before.id,
        organizationId,
        before: {
          until: before.extendedUntil && civilDate(before.extendedUntil),
          reason: before.extendedReason,
        },
        after: { until: input.until, reason: input.reason.trim() },
      });
      return { extendedUntil: input.until };
    });
  }

  private async lock(tx: Prisma.TransactionClient, organizationId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OrganizationSubscription"
      WHERE "organizationId"=${organizationId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException("Farmacia no encontrada.");
  }
}
