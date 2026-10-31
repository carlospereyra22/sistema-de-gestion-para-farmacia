import type { Prisma } from "@prisma/client";
import {
  assertCustomerDocumentAvailable,
  normalizeCustomerDocument,
} from "./customer-identity";
import { PartiesService } from "./parties.service";
import type { PrismaService } from "../prisma/prisma.service";

const duplicate = {
  id: "existing",
  name: "Carlos",
  active: true,
  document: "12.345.678",
  billingTaxId: null,
};
function setup(customers = [duplicate]) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    customer: {
      findMany: jest.fn().mockResolvedValue(customers),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "editing", billingTaxId: "11111111" }),
      create: jest.fn().mockResolvedValue({ id: "new", creditLimitMinor: 0n }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: true,
        roles: [
          {
            role: { permissions: [{ permission: { code: "PARTY_MANAGE" } }] },
          },
        ],
      }),
    },
    $transaction: jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    ),
  };
  return {
    tx,
    service: new PartiesService(prisma as unknown as PrismaService),
  };
}
describe("customer document uniqueness", () => {
  it("normalizes separators and allows missing documents", async () => {
    expect(normalizeCustomerDocument(" 20-12345678-9 ")).toBe("20123456789");
    const { tx, service } = setup();
    await service.create("actor", "org", "customers", "Carlos");
    expect(tx.customer.create).toHaveBeenCalled();
    expect(tx.customer.findMany).not.toHaveBeenCalled();
  });
  it("rejects cross-field duplicates on create without writing or auditing", async () => {
    const { tx, service } = setup();
    await expect(
      service.create(
        "actor",
        "org",
        "customers",
        "Otro nombre",
        undefined,
        undefined,
        { billingTaxId: "12345678" },
      ),
    ).rejects.toThrow("Ya existe un cliente");
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org" } }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.customer.findMany.mock.invocationCallOrder[0]!,
    );
  });
  it("blocks document changes to another customer's identity", async () => {
    const { tx, service } = setup();
    await expect(
      service.updateBilling("actor", "org", "editing", {
        billingTaxId: "12 345 678",
      }),
    ).rejects.toThrow("Carlos");
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org", id: { not: "editing" } },
      }),
    );
  });
  it("allows unchanged identities, clearing documents and unrelated edits", async () => {
    const { tx, service } = setup();
    await service.updateBilling("actor", "org", "editing", {
      billingTaxId: "11.111.111",
    });
    await service.updateBilling("actor", "org", "editing", {
      billingTaxId: "",
    });
    await service.updateBilling("actor", "org", "editing", { name: "Carlos" });
    expect(tx.customer.update).toHaveBeenCalledTimes(3);
    expect(tx.customer.findMany).not.toHaveBeenCalled();
  });
  it("reserves archived documents and suggests restoring the existing profile", async () => {
    const { tx } = setup([{ ...duplicate, active: false }]);
    await expect(
      assertCustomerDocumentAvailable(
        tx as unknown as Prisma.TransactionClient,
        "org",
        ["12345678"],
      ),
    ).rejects.toThrow("restaurarlo");
  });
  it("allows a distinct document in the scoped organization", async () => {
    const { service, tx } = setup();
    await service.create("actor", "org", "customers", "Carlos", "87654321");
    expect(tx.customer.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
