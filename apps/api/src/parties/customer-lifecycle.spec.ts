import { PartiesService } from "./parties.service";
import type { PrismaService } from "../prisma/prisma.service";
describe("customer soft deletion", () => {
  function setup(balance = 0n, found = true, allowed = true, active = true) {
    const tx = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(
          found
            ? {
                id: "customer",
                active,
                accountMovements: [{ type: "DEBIT", amountMinor: balance }],
              }
            : null,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const transaction = jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
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
  it("archives without deleting historical data and audits in a serializable transaction", async () => {
    const { service, tx, transaction } = setup();
    await service.setCustomerActive("actor", "org", "customer", false);
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      include: { accountMovements: true },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      data: { active: false },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
  it.each([100n, -100n])("blocks a nonzero balance (%s)", async (balance) => {
    const { service, tx } = setup(balance);
    await expect(
      service.setCustomerActive("actor", "org", "customer", false),
    ).rejects.toThrow("saldo");
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("restores without changing balances or credit settings", async () => {
    const { service, tx } = setup(0n, true, true, false);
    await service.setCustomerActive("actor", "org", "customer", true);
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: "customer", organizationId: "org" },
      data: { active: true },
    });
  });
  it("rejects another organization's customer and missing permission", async () => {
    const missing = setup(0n, false);
    await expect(
      missing.service.setCustomerActive("actor", "org", "customer", false),
    ).rejects.toThrow();
    expect(missing.tx.customer.update).not.toHaveBeenCalled();
    const forbidden = setup(0n, true, false);
    await expect(
      forbidden.service.setCustomerActive("actor", "org", "customer", false),
    ).rejects.toThrow();
    expect(forbidden.transaction).not.toHaveBeenCalled();
  });
});
