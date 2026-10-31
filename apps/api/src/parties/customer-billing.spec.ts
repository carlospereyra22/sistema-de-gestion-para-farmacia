import { validate } from "class-validator";
import { billingData, CustomerBillingDto } from "./customer-billing.dto";
import { PartiesService } from "./parties.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("optional customer billing", () => {
  it("validates optional notes and supports clearing them", async () => {
    expect(billingData({ notes: "  Entregar por la tarde  " })).toEqual({
      notes: "Entregar por la tarde",
    });
    expect(billingData({ notes: " " })).toEqual({ notes: null });
    expect(
      await validate(
        Object.assign(new CustomerBillingDto(), { notes: "x".repeat(1000) }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          Object.assign(new CustomerBillingDto(), { notes: "x".repeat(1001) }),
        )
      ).map((e) => e.property),
    ).toContain("notes");
    const { service, tx } = setup();
    await service.updateBilling("actor", "org", "customer", {
      notes: "Contacto alternativo",
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      data: { notes: "Contacto alternativo" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("allows an empty profile and clears only explicitly supplied fields", async () => {
    expect(await validate(new CustomerBillingDto())).toHaveLength(0);
    expect(billingData({})).toEqual({});
    expect(
      billingData({ billingName: "  Cliente  ", billingEmail: "" }),
    ).toEqual({ billingName: "Cliente", billingEmail: null });
  });
  it("validates email and field lengths without requiring tax data", async () => {
    const dto = Object.assign(new CustomerBillingDto(), {
      billingEmail: "incorrecto",
      billingName: "x".repeat(161),
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(["billingEmail", "billingName"]),
    );
    expect(
      await validate(
        Object.assign(new CustomerBillingDto(), { billingEmail: "" }),
      ),
    ).toHaveLength(0);
  });
  function setup(allowed = true, found = true) {
    const tx = {
      customer: {
        findFirst: jest
          .fn()
          .mockResolvedValue(found ? { id: "customer" } : null),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const transaction = jest.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    const prisma = {
      userOrganization: {
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          roles: [
            {
              role: {
                permissions: allowed
                  ? [{ permission: { code: "PARTY_MANAGE" } }]
                  : [],
              },
            },
          ],
        }),
      },
      $transaction: transaction,
    };
    return {
      tx,
      transaction,
      service: new PartiesService(prisma as unknown as PrismaService),
    };
  }
  it("updates only billing within the organization and audits in the same transaction", async () => {
    const { service, tx } = setup();
    await service.updateBilling("actor", "org", "customer", {
      billingName: "Razón social",
    });
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      data: { billingName: "Razón social" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: "actor",
          organizationId: "org",
          action: "CUSTOMER_BILLING_UPDATED",
        }),
      }),
    );
  });
  it("uses the main customer name and rejects blank names", async () => {
    const { service, tx } = setup();
    await service.updateBilling("actor", "org", "customer", {
      name: "  Abril SRL  ",
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      data: { name: "Abril SRL" },
    });
    await expect(
      service.updateBilling("actor", "org", "customer", { name: "   " }),
    ).rejects.toThrow("nombre o razón social");
    expect(tx.customer.update).toHaveBeenCalledTimes(1);
  });
  it("rejects missing permission and clients from another organization", async () => {
    const forbidden = setup(false);
    await expect(
      forbidden.service.updateBilling("actor", "org", "customer", {}),
    ).rejects.toThrow();
    expect(forbidden.transaction).not.toHaveBeenCalled();
    const missing = setup(true, false);
    await expect(
      missing.service.updateBilling("actor", "org", "customer", {}),
    ).rejects.toThrow();
    expect(missing.tx.customer.update).not.toHaveBeenCalled();
  });
});
