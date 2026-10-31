import {
  DistributionService,
  distributionPayload,
  type DistributionInput,
} from "./distribution.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

const input: DistributionInput = {
  requestId: "req",
  destination: "Reparto externo",
  reason: "Salida semanal",
  confirmed: true,
  items: [{ lotId: "lot", quantity: 2 }],
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    distributionDispatch: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "dispatch" }),
      update: jest
        .fn()
        .mockResolvedValue({ id: "dispatch", reversedAt: new Date() }),
    },
    productLot: {
      findFirst: jest.fn().mockResolvedValue({
        id: "lot",
        productId: "product",
        number: "L1",
        expiresAt: null,
        quantity: 10,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: { findFirst: jest.fn().mockResolvedValue({ name: "Producto" }) },
    productBranchState: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn() },
    inventoryMovement: { createMany: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: true,
        roles: [
          {
            role: {
              permissions: [{ permission: { code: "INVENTORY_MANAGE" } }],
            },
          },
        ],
      }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const audit = { recordInTransaction: jest.fn() };
  return {
    tx,
    prisma,
    audit,
    service: new DistributionService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    ),
  };
}
describe("external distribution", () => {
  it("canonicalizes inputs to protect idempotent retries", () => {
    const a = {
      ...input,
      items: [
        { lotId: "b", quantity: 2 },
        { lotId: "a", quantity: 1 },
      ],
    };
    expect(distributionPayload(a).payloadHash).toBe(
      distributionPayload({
        ...a,
        destination: " Reparto externo ",
        items: [...a.items].reverse(),
      }).payloadHash,
    );
  });
  it.each([0, -1, 1.5, 2147483648])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(() =>
        distributionPayload({ ...input, items: [{ lotId: "lot", quantity }] }),
      ).toThrow();
    },
  );
  it("rejects duplicate lots, blank destination and absent confirmation", () => {
    expect(() =>
      distributionPayload({
        ...input,
        items: [...input.items, ...input.items],
      }),
    ).toThrow();
    expect(() =>
      distributionPayload({ ...input, destination: "   " }),
    ).toThrow();
    expect(() => distributionPayload({ ...input, confirmed: false })).toThrow();
  });
  it("creates only inventory and audit records under the transaction", async () => {
    const { service, tx, audit } = setup();
    await service.create("actor", "org", "branch", input);
    expect(tx.productLot.findFirst).toHaveBeenCalledWith({
      where: { id: "lot", organizationId: "org", branchId: "branch" },
    });
    expect(tx.productLot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 2 } }),
        data: { quantity: { decrement: 2 } },
      }),
    );
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          referenceType: "DISTRIBUTION",
          referenceId: "dispatch",
          quantity: -2,
        }),
      ],
    });
    expect(audit.recordInTransaction).toHaveBeenCalled();
  });
  it("returns the persisted request without a second deduction", async () => {
    const { service, tx } = setup();
    const previous = {
      id: "dispatch",
      payloadHash: distributionPayload(input).payloadHash,
    };
    tx.distributionDispatch.findUnique.mockResolvedValue(previous);
    expect(await service.create("actor", "org", "branch", input)).toEqual(
      previous,
    );
    expect(tx.productLot.updateMany).not.toHaveBeenCalled();
    expect(tx.distributionDispatch.create).not.toHaveBeenCalled();
  });
  it("rejects a reused key with a different payload", async () => {
    const { service, tx } = setup();
    tx.distributionDispatch.findUnique.mockResolvedValue({
      payloadHash: "different",
    });
    await expect(
      service.create("actor", "org", "branch", input),
    ).rejects.toThrow("otros datos");
    expect(tx.productLot.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { id: "lot", quantity: 1, expiresAt: null },
    { id: "lot", quantity: 10, expiresAt: new Date("2000-01-01") },
  ])("blocks unavailable, insufficient and expired lots", async (lot) => {
    const { service, tx } = setup();
    tx.productLot.findFirst.mockResolvedValue(lot);
    await expect(
      service.create("actor", "org", "branch", input),
    ).rejects.toThrow();
    expect(tx.distributionDispatch.create).not.toHaveBeenCalled();
  });
  it("fails the transaction when a concurrent stock condition fails", async () => {
    const { service, tx } = setup();
    tx.productLot.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.create("actor", "org", "branch", input),
    ).rejects.toThrow("stock cambió");
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });
  it("requires permission before starting a transaction", async () => {
    const { service, prisma } = setup();
    prisma.userOrganization.findUnique.mockResolvedValue(null);
    await expect(
      service.create("actor", "org", "branch", input),
    ).rejects.toThrow("permiso");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("reverses once, preserves the document, and requires explicit confirmation", async () => {
    const { service, tx } = setup();
    await expect(
      service.reverse("actor", "org", "branch", "dispatch", "Error", false),
    ).rejects.toThrow();
    tx.distributionDispatch.findFirst.mockResolvedValue({
      id: "dispatch",
      reversedAt: null,
      items: [{ lotId: "lot", productId: "product", quantity: 2 }],
    });
    await service.reverse(
      "actor",
      "org",
      "branch",
      "dispatch",
      "Error de carga",
      true,
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 2,
        referenceType: "DISTRIBUTION_REVERSAL",
      }),
    });
    tx.productLot.updateMany.mockClear();
    tx.distributionDispatch.findFirst.mockResolvedValue({
      reversedAt: new Date(),
    });
    await service.reverse(
      "actor",
      "org",
      "branch",
      "dispatch",
      "Error de carga",
      true,
    );
    expect(tx.productLot.updateMany).not.toHaveBeenCalled();
  });
});
