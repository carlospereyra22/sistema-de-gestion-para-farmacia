import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hash } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { provisionOrganizationGraph } from "../organizations/organization-provisioning";
import { PrismaService } from "../prisma/prisma.service";
import { generateBranchCode } from "../organizations/branch-code";
import { recordPlatformAudit } from "./platform-audit";
import { PlatformBillingService } from "./platform-billing.service";
import { assertQuotaAvailable } from "./subscription-quota";
import {
  commercialToday,
  nextCut,
  resolveSubscriptionAccess,
} from "./subscription-access";
import { contractedQuota, monthlyFeeMinor } from "./subscription-fee";

const DEFAULT_PLAN = "ESTANDAR";
const DAY_MS = 24 * 60 * 60 * 1000;

export type NewOrganizationInput = {
  organizationName: string;
  branchName: string;
  ownerEmail: string;
  trialDays: number;
  contactName?: string;
  contactPhone?: string;
};

export type SubscriptionChange = {
  extraUsers: number;
  extraBranches: number;
  agreedPriceMinor: string | null;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
};

export type PlanPrices = {
  baseMinor: string;
  extraUserMinor: string;
  extraBranchMinor: string;
};

const subscriptionInclude = { plan: true } as const;

type SubscriptionWithPlan = Prisma.OrganizationSubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

const civilDate = (value: Date | null) =>
  value?.toISOString().slice(0, 10) ?? null;

/** La clave se muestra una sola vez y el sistema obliga a cambiarla al entrar. */
const temporaryPassword = () => randomBytes(12).toString("base64url");

function subscriptionView(subscription: SubscriptionWithPlan, now: Date) {
  const access = resolveSubscriptionAccess(subscription, now);
  return {
    ...access,
    nextCut: nextCut(access, now),
    exempt: subscription.exempt,
    trialEndsAt: civilDate(subscription.trialEndsAt),
    paidThrough: civilDate(subscription.paidThrough),
    extendedUntil: civilDate(subscription.extendedUntil),
    extendedReason: subscription.extendedReason,
    extraUsers: subscription.extraUsers,
    extraBranches: subscription.extraBranches,
    agreedPriceMinor: subscription.agreedPriceMinor?.toString() ?? null,
    contactName: subscription.contactName,
    contactPhone: subscription.contactPhone,
    contactEmail: subscription.contactEmail,
    feeMinor: monthlyFeeMinor(subscription.plan, subscription).toString(),
    quota: contractedQuota(subscription.plan, subscription),
  };
}

/** Solo datos comerciales: el panel nunca lee ventas, clientes ni stock de una farmacia. */
@Injectable()
export class PlatformOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
  ) {}

  async list() {
    const now = new Date();
    const balances = await this.billing.balances();
    const organizations = await this.prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: { include: subscriptionInclude },
        _count: {
          select: {
            branches: { where: { active: true, deletedAt: null } },
            userMemberships: { where: { active: true } },
          },
        },
      },
    });
    return organizations.map(({ subscription, _count, ...organization }) => ({
      ...organization,
      balanceMinor: (balances.get(organization.id) ?? 0n).toString(),
      activeBranches: _count.branches,
      activeUsers: _count.userMemberships,
      subscription: subscription ? subscriptionView(subscription, now) : null,
    }));
  }

  async detail(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: { include: subscriptionInclude },
        branches: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true, active: true },
        },
        userMemberships: {
          orderBy: { createdAt: "asc" },
          select: {
            active: true,
            displayName: true,
            user: {
              select: { id: true, email: true, mustChangePassword: true },
            },
            roles: { select: { role: { select: { code: true, name: true } } } },
          },
        },
        roles: {
          orderBy: { name: "asc" },
          select: { code: true, name: true },
        },
      },
    });
    if (!organization) throw new NotFoundException("Farmacia no encontrada.");
    const { subscription, userMemberships, ...rest } = organization;
    return {
      ...rest,
      billing: await this.billing.ledger(organizationId),
      subscription: subscription
        ? subscriptionView(subscription, new Date())
        : null,
      users: userMemberships.map(({ user, roles, ...membership }) => ({
        ...membership,
        id: user.id,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        roles: roles.map(({ role }) => role),
      })),
    };
  }

  /** Farmacia, sucursal, roles, dueño y suscripción: o se crea todo, o nada. */
  async create(actorId: string, input: NewOrganizationInput) {
    const email = input.ownerEmail.trim().toLowerCase();
    const password = temporaryPassword();
    const passwordHash = await hash(password);
    const trialEndsAt = new Date(
      Date.parse(`${commercialToday(new Date())}T00:00:00.000Z`) +
        input.trialDays * DAY_MS,
    );
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertEmailAvailable(tx, email);
        const plan = await tx.subscriptionPlan.findUniqueOrThrow({
          where: { code: DEFAULT_PLAN },
        });
        const { organization, branch, owner } =
          await provisionOrganizationGraph(tx, {
            organizationName: input.organizationName.trim(),
            branchName: input.branchName.trim(),
            ownerEmail: email,
            ownerPasswordHash: passwordHash,
            ownerMustChangePassword: true,
          });
        await tx.organizationSubscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            trialEndsAt,
            contactName: input.contactName?.trim() || null,
            contactPhone: input.contactPhone?.trim() || null,
            contactEmail: email,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            branchId: branch.id,
            actorId,
            entityType: "Organization",
            entityId: organization.id,
            action: "ORGANIZATION_CREATED_BY_PLATFORM",
            after: { name: organization.name, ownerEmail: email },
          },
        });
        await recordPlatformAudit(tx, {
          actorId,
          action: "PLATFORM_ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: organization.id,
          organizationId: organization.id,
          after: { name: organization.name, ownerEmail: email },
        });
        return {
          id: organization.id,
          name: organization.name,
          email: owner.email,
          temporaryPassword: password,
        };
      },
      { timeout: 30000 },
    );
  }

  async addUser(
    actorId: string,
    organizationId: string,
    input: { email: string; displayName?: string; roleCode: string },
  ) {
    const email = input.email.trim().toLowerCase();
    const password = temporaryPassword();
    const passwordHash = await hash(password);
    return this.prisma.$transaction(async (tx) => {
      await this.assertEmailAvailable(tx, email);
      await assertQuotaAvailable(tx, organizationId, "users");
      const role = await tx.role.findUnique({
        where: {
          organizationId_code: { organizationId, code: input.roleCode },
        },
      });
      if (!role) throw new NotFoundException("Rol no encontrado.");
      const branches = await tx.branch.findMany({
        where: { organizationId, active: true, deletedAt: null },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          mustChangePassword: true,
          organizations: {
            create: {
              organizationId,
              displayName: input.displayName?.trim() || null,
              roles: { create: { roleId: role.id } },
            },
          },
          branches: {
            create: branches.map(({ id }) => ({ branchId: id })),
          },
        },
        select: { id: true, email: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "USER",
          entityId: user.id,
          action: "USER_CREATED_BY_PLATFORM",
          after: { email, roleCode: input.roleCode },
        },
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_USER_CREATED",
        entityType: "User",
        entityId: user.id,
        organizationId,
        after: { email, roleCode: input.roleCode },
      });
      return { email: user.email, temporaryPassword: password };
    });
  }

  /**
   * Quien crea la sucursal acá no pertenece a la farmacia: se les asigna a sus dueños,
   * porque si no nadie podría operarla hasta que alguien la asigne a mano.
   */
  async addBranch(
    actorId: string,
    organizationId: string,
    input: { name: string },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!organization)
          throw new NotFoundException("Farmacia no encontrada.");
        await assertQuotaAvailable(tx, organizationId, "branches");
        const name = input.name.trim();
        const branch = await tx.branch.create({
          data: {
            organizationId,
            name,
            code: await generateBranchCode(tx, organizationId, name),
          },
          select: { id: true, name: true, code: true },
        });
        const owners = await tx.userOrganization.findMany({
          where: {
            organizationId,
            active: true,
            roles: { some: { role: { code: "OWNER" } } },
          },
          select: { userId: true },
        });
        await tx.userBranch.createMany({
          data: owners.map(({ userId }) => ({ userId, branchId: branch.id })),
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            branchId: branch.id,
            actorId,
            entityType: "BRANCH",
            entityId: branch.id,
            action: "CREATED_BY_PLATFORM",
            after: { ...branch },
          },
        });
        await recordPlatformAudit(tx, {
          actorId,
          action: "PLATFORM_BRANCH_CREATED",
          entityType: "Branch",
          entityId: branch.id,
          organizationId,
          after: { ...branch },
        });
        return branch;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Se creó otra sucursal al mismo tiempo. Volvé a intentarlo.",
        );
      throw error;
    }
  }

  async resetPassword(actorId: string, organizationId: string, userId: string) {
    const password = temporaryPassword();
    const passwordHash = await hash(password);
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { user: { select: { email: true } } },
      });
      if (!membership) throw new NotFoundException("Usuario no encontrado.");
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "USER",
          entityId: userId,
          action: "PASSWORD_RESET_BY_PLATFORM",
        },
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_PASSWORD_RESET",
        entityType: "User",
        entityId: userId,
        organizationId,
        after: { email: membership.user.email },
      });
      return { email: membership.user.email, temporaryPassword: password };
    });
  }

  async updateSubscription(
    actorId: string,
    organizationId: string,
    input: SubscriptionChange,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OrganizationSubscription" WHERE "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const before = await tx.organizationSubscription.findUnique({
        where: { organizationId },
      });
      if (!before) throw new NotFoundException("Farmacia no encontrada.");
      const after = await tx.organizationSubscription.update({
        where: { organizationId },
        data: {
          extraUsers: input.extraUsers,
          extraBranches: input.extraBranches,
          agreedPriceMinor:
            input.agreedPriceMinor === null
              ? null
              : BigInt(input.agreedPriceMinor),
          contactName: input.contactName?.trim() || null,
          contactPhone: input.contactPhone?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
        },
        include: subscriptionInclude,
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_SUBSCRIPTION_UPDATED",
        entityType: "OrganizationSubscription",
        entityId: after.id,
        organizationId,
        before: {
          extraUsers: before.extraUsers,
          extraBranches: before.extraBranches,
          agreedPriceMinor: before.agreedPriceMinor?.toString() ?? null,
        },
        after: {
          extraUsers: after.extraUsers,
          extraBranches: after.extraBranches,
          agreedPriceMinor: after.agreedPriceMinor?.toString() ?? null,
        },
      });
      return subscriptionView(after, new Date());
    });
  }

  async plans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { name: "asc" },
    });
    return plans.map((plan) => ({
      ...plan,
      baseMinor: plan.baseMinor.toString(),
      extraUserMinor: plan.extraUserMinor.toString(),
      extraBranchMinor: plan.extraBranchMinor.toString(),
    }));
  }

  async updatePlan(actorId: string, planId: string, input: PlanPrices) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.subscriptionPlan.findUnique({
        where: { id: planId },
      });
      if (!before) throw new NotFoundException("Plan no encontrado.");
      const after = await tx.subscriptionPlan.update({
        where: { id: planId },
        data: {
          baseMinor: BigInt(input.baseMinor),
          extraUserMinor: BigInt(input.extraUserMinor),
          extraBranchMinor: BigInt(input.extraBranchMinor),
        },
      });
      await recordPlatformAudit(tx, {
        actorId,
        action: "PLATFORM_PLAN_UPDATED",
        entityType: "SubscriptionPlan",
        entityId: planId,
        before: {
          baseMinor: before.baseMinor.toString(),
          extraUserMinor: before.extraUserMinor.toString(),
          extraBranchMinor: before.extraBranchMinor.toString(),
        },
        after: { ...input },
      });
      return { id: after.id };
    });
  }

  private async assertEmailAvailable(
    tx: Prisma.TransactionClient,
    email: string,
  ) {
    if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
      throw new ConflictException(
        "Ese correo ya tiene una cuenta. Usá otro para esta persona.",
      );
  }
}
