import { CashService } from "./cash.service";

function setup(admin = false) {
  const member = {
    active: true,
    roles: [
      {
        role: {
          code: admin ? "ADMIN" : "CASHIER",
          permissions: [{ permission: { code: "CASH_READ" } }],
        },
      },
    ],
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue(member),
      findUniqueOrThrow: jest.fn().mockResolvedValue(member),
      findMany: jest.fn().mockResolvedValue([
        { userId: "opener", displayName: "Ana" },
        { userId: "closer", displayName: "Juan" },
      ]),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
    cashRegister: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "register", name: "Central" }]),
    },
    cashSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: "session",
        cashRegisterId: "register",
        openedById: "opener",
        openedAt: new Date(),
        closedAt: new Date(),
        archivedAt: null,
        openingAmountMinor: 10000n,
        closingAmountMinor: 15000n,
        movements: [
          {
            id: "movement",
            type: "IN",
            amountMinor: 2000n,
            actorId: "opener",
            reason: "Fondo extra",
            createdAt: new Date(),
          },
        ],
      }),
    },
    salePayment: {
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { cashSessionId: "session", _sum: { amountMinor: 4000n } },
        ]),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "payment",
          saleId: "sale",
          amountMinor: 4000n,
          createdAt: new Date(),
        },
      ]),
    },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue({
        actorId: "closer",
        after: {
          expectedAmountMinor: "18000",
          differenceMinor: "-3000",
          reason: "Faltante de prueba",
        },
      }),
    },
  };
  return { prisma, service: new CashService(prisma as never, {} as never) };
}
describe("closure detail", () => {
  it("uses the recorded closing balance and reason, and serializes money", async () => {
    const { prisma, service } = setup();
    const result = await service.closureDetail(
      "user",
      "org",
      "branch",
      "session",
    );
    expect(result).toMatchObject({
      expectedAmountMinor: "18000",
      closingAmountMinor: "15000",
      differenceMinor: "-3000",
      snapshotAvailable: true,
      closedBy: "Juan",
      openedBy: "Ana",
      reason: "Faltante de prueba",
    });
    expect(result.movements[0]).toMatchObject({
      amountMinor: "2000",
      actorName: "Ana",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(prisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cashRegisterId: { in: ["register"] },
          archivedAt: null,
          closedAt: { not: null },
        }),
      }),
    );
    expect(prisma.salePayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          method: "CASH",
          sale: {
            organizationId: "org",
            branchId: "branch",
            status: "COMPLETED",
          },
        }),
      }),
    );
  });
  it("marks a historical balance as reconstructed without inventing a closer", async () => {
    const { prisma, service } = setup();
    prisma.auditLog.findFirst.mockResolvedValue(null);
    expect(
      await service.closureDetail("user", "org", "branch", "session"),
    ).toMatchObject({
      expectedAmountMinor: "16000",
      differenceMinor: "-1000",
      snapshotAvailable: false,
      closedBy: null,
      reason: null,
    });
  });
  it("rejects inaccessible or non-closed sessions before querying financial details", async () => {
    const { prisma, service } = setup();
    prisma.cashSession.findFirst.mockResolvedValue(null);
    await expect(
      service.closureDetail("user", "org", "branch", "missing"),
    ).rejects.toThrow("Cierre no disponible");
    expect(prisma.salePayment.findMany).not.toHaveBeenCalled();
  });
  it("requires cash read permission", async () => {
    const { prisma, service } = setup();
    prisma.userOrganization.findUnique.mockResolvedValue(null);
    await expect(
      service.closureDetail("user", "org", "branch", "session"),
    ).rejects.toThrow();
    expect(prisma.cashSession.findFirst).not.toHaveBeenCalled();
  });
  it("allows an administrator to consult archived closures", async () => {
    const { prisma, service } = setup(true);
    await service.closureDetail("user", "org", "branch", "session");
    expect(
      prisma.cashSession.findFirst.mock.calls[0]![0].where,
    ).not.toHaveProperty("archivedAt");
  });
});
