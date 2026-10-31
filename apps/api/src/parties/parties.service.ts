import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { supplierProfile, type SupplierProfile } from "./supplier-profile";
import {
  billingData,
  CustomerBillingDto,
  UpdateCustomerBillingDto,
} from "./customer-billing.dto";
import {
  assertCustomerDocumentAvailable,
  normalizeCustomerDocument,
} from "./customer-identity";

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(
    actorId: string,
    organizationId: string,
    type: "customers" | "suppliers",
  ) {
    await this.assert(actorId, organizationId, "PARTY_READ");
    return type === "customers"
      ? this.prisma.customer
          .findMany({
            where: { organizationId },
            orderBy: { name: "asc" },
          })
          .then((customers) =>
            customers.map((customer) => ({
              ...customer,
              creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
            })),
          )
      : this.prisma.supplier.findMany({
          where: { organizationId },
          orderBy: { name: "asc" },
        });
  }
  async create(
    actorId: string,
    organizationId: string,
    type: "customers" | "suppliers",
    name: string,
    document?: string,
    priceListId?: string,
    billing: CustomerBillingDto = {},
    terms = { accountEnabled: false, accountTermDays: null as number | null },
    profile: SupplierProfile = {},
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    if (
      type === "customers" &&
      priceListId &&
      !(await this.prisma.priceList.findFirst({
        where: { id: priceListId, organizationId, active: true },
      }))
    )
      throw new NotFoundException("Price list is unavailable.");
    return type === "customers"
      ? this.prisma.$transaction(async (tx) => {
          await assertCustomerDocumentAvailable(tx, organizationId, [
            document,
            billing?.billingTaxId,
          ]);
          const customer = await tx.customer.create({
            data: {
              organizationId,
              name: name.trim(),
              document: document?.trim(),
              priceListId,
              ...billingData(billing ?? {}),
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId,
              entityType: "CUSTOMER",
              entityId: customer.id,
              action: "CUSTOMER_CREATED",
            },
          });
          return {
            ...customer,
            creditLimitMinor: customer.creditLimitMinor?.toString() ?? null,
          };
        })
      : this.prisma.$transaction(async (tx) => {
          this.validateSupplierTerms(terms);
          const fields = supplierProfile({ ...profile, name });
          const supplier = await tx.supplier.create({
            data: {
              organizationId,
              name: name.trim(),
              taxId: document?.trim(),
              ...terms,
              ...fields,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              actorId,
              entityType: "SUPPLIER",
              entityId: supplier.id,
              action: "SUPPLIER_CREATED",
              after: { ...terms, ...fields },
            },
          });
          return supplier;
        });
  }
  private validateSupplierTerms(input: {
    accountEnabled: boolean;
    accountTermDays?: number | null;
  }) {
    if (
      typeof input.accountEnabled !== "boolean" ||
      (input.accountTermDays != null &&
        (!Number.isInteger(input.accountTermDays) ||
          input.accountTermDays < 0 ||
          input.accountTermDays > 3650))
    )
      throw new BadRequestException(
        "Revisá la condición y el plazo del proveedor.",
      );
  }
  async updateSupplierTerms(
    actorId: string,
    organizationId: string,
    supplierId: string,
    input: SupplierProfile & {
      accountEnabled: boolean;
      accountTermDays?: number | null;
      expectedUpdatedAt?: string;
    },
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    this.validateSupplierTerms(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${supplierId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const before = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId, active: true },
      });
      if (!before) throw new NotFoundException("Proveedor no disponible.");
      if (input.expectedUpdatedAt !== before.updatedAt.toISOString())
        throw new ConflictException(
          "El proveedor cambió. Actualizá antes de guardar.",
        );
      const data = {
        ...supplierProfile(input),
        accountEnabled: input.accountEnabled,
        accountTermDays: input.accountEnabled
          ? (input.accountTermDays ?? null)
          : null,
      };
      const result = await tx.supplier.update({
        where: { id: supplierId },
        data,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "SUPPLIER",
          entityId: supplierId,
          action: "SUPPLIER_TERMS_UPDATED",
          before: {
            name: before.name,
            phone: before.phone,
            email: before.email,
            contactName: before.contactName,
            address: before.address,
            notes: before.notes,
            accountEnabled: before.accountEnabled,
            accountTermDays: before.accountTermDays,
          },
          after: data,
        },
      });
      return result;
    });
  }
  async updateBilling(
    actorId: string,
    organizationId: string,
    customerId: string,
    input: UpdateCustomerBillingDto,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    if (
      input.name !== undefined &&
      (typeof input.name !== "string" ||
        input.name.trim().length < 2 ||
        input.name.trim().length > 160)
    ) {
      throw new BadRequestException(
        "El nombre o razón social debe tener entre 2 y 160 caracteres.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // Lock before reading the current profile, so concurrent edits see the latest document.
      if (input.billingTaxId !== undefined)
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
      });
      if (!customer)
        throw new NotFoundException(
          "El cliente no está disponible en esta organización.",
        );
      if (
        input.billingTaxId !== undefined &&
        normalizeCustomerDocument(input.billingTaxId) !==
          normalizeCustomerDocument(customer.billingTaxId)
      )
        await assertCustomerDocumentAvailable(
          tx,
          organizationId,
          [input.billingTaxId],
          customerId,
        );
      const data = {
        ...(input.priceListId !== undefined
          ? { priceListId: input.priceListId || null }
          : {}),
        ...billingData(input),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      };
      if (
        input.priceListId &&
        !(await tx.priceList.findFirst({
          where: { id: input.priceListId, organizationId, active: true },
        }))
      ) {
        throw new NotFoundException("La lista de precios no está disponible.");
      }
      await tx.customer.update({
        where: { id: customerId, organizationId },
        data,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "CUSTOMER",
          entityId: customerId,
          action: "CUSTOMER_BILLING_UPDATED",
          after: { fields: Object.keys(data) },
        },
      });
      return { ok: true };
    });
  }
  async setSupplierActive(
    actorId: string,
    organizationId: string,
    supplierId: string,
    active: boolean,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${supplierId}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId },
      });
      if (!supplier) throw new NotFoundException("Proveedor no disponible.");
      if (supplier.active === active) return { ok: true };
      await tx.supplier.update({
        where: { id: supplierId, organizationId },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "SUPPLIER",
          entityId: supplierId,
          action: active ? "SUPPLIER_RESTORED" : "SUPPLIER_ARCHIVED",
          before: { active: supplier.active },
          after: { active },
        },
      });
      return { ok: true };
    });
  }
  async setCustomerActive(
    actorId: string,
    organizationId: string,
    customerId: string,
    active: boolean,
  ) {
    await this.assert(actorId, organizationId, "PARTY_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, organizationId },
          include: { accountMovements: true },
        });
        if (!customer)
          throw new NotFoundException(
            "El cliente no está disponible en esta organización.",
          );
        if (customer.active === active) return { ok: true };
        const balance = customer.accountMovements.reduce(
          (sum, movement) =>
            sum +
            (movement.type === "DEBIT"
              ? movement.amountMinor
              : -movement.amountMinor),
          0n,
        );
        if (!active && balance !== 0n)
          throw new BadRequestException(
            "El cliente tiene saldo pendiente o saldo a favor. Regularizá su cuenta corriente antes de eliminarlo.",
          );
        await tx.customer.update({
          where: { id: customerId, organizationId },
          data: { active },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            entityType: "CUSTOMER",
            entityId: customerId,
            action: active ? "CUSTOMER_RESTORED" : "CUSTOMER_ARCHIVED",
            before: { active: customer.active },
            after: { active },
          },
        });
        return { ok: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async assert(actorId: string, organizationId: string, code: string) {
    const membership = await this.prisma.userOrganization.findUnique({
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
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException("You do not have the required permission.");
  }
}
