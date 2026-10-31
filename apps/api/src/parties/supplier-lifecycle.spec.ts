import { PartiesService } from "./parties.service";
import type { PrismaService } from "../prisma/prisma.service";

function setup(active = true, found = true, allowed = true) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    supplier: {
      findFirst: jest.fn().mockResolvedValue(found ? { active } : null),
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
            role: {
              permissions: allowed
                ? [{ permission: { code: "PARTY_MANAGE" } }]
                : [],
            },
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
    prisma,
    service: new PartiesService(prisma as unknown as PrismaService),
  };
}
describe("supplier lifecycle", () => {
  it.each([false, true])(
    "changes active to %s preserving history",
    async (active) => {
      const { service, tx } = setup(!active);
      await service.setSupplierActive("actor", "org", "supplier", active);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: "supplier", organizationId: "org" },
      });
      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: "supplier", organizationId: "org" },
        data: { active },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: active ? "SUPPLIER_RESTORED" : "SUPPLIER_ARCHIVED",
        }),
      });
    },
  );
  it("is idempotent", async () => {
    const { service, tx } = setup(false);
    await service.setSupplierActive("actor", "org", "supplier", false);
    expect(tx.supplier.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects missing supplier and permission", async () => {
    const missing = setup(true, false);
    await expect(
      missing.service.setSupplierActive("actor", "org", "supplier", false),
    ).rejects.toThrow();
    expect(missing.tx.supplier.update).not.toHaveBeenCalled();
    const forbidden = setup(true, true, false);
    await expect(
      forbidden.service.setSupplierActive("actor", "org", "supplier", false),
    ).rejects.toThrow();
    expect(forbidden.prisma.$transaction).not.toHaveBeenCalled();
  });
});
