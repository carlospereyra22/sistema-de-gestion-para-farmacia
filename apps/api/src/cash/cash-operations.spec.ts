import { CashService } from "./cash.service";

function setup() {
  const tx = {
    userOrganization: { findMany: jest.fn().mockResolvedValue([]) },
    cashSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    cashSession: {
      findFirst: jest.fn().mockResolvedValue({
        id: "session",
        cashRegisterId: "register",
        openedById: "actor",
        openingAmountMinor: 1000000n,
      }),
      update: jest.fn().mockResolvedValue({
        id: "session",
        openingAmountMinor: 1000000n,
        closingAmountMinor: 1550000n,
      }),
    },
    cashRegister: {
      findFirst: jest.fn().mockResolvedValue({ id: "register" }),
    },
    salePayment: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amountMinor: 500000n } }),
    },
    cashMovement: {
      groupBy: jest.fn().mockResolvedValue([
        { type: "IN", _sum: { amountMinor: 200000n } },
        { type: "OUT", _sum: { amountMinor: 100000n } },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => data,
        ),
    },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: true,
        roles: [
          {
            role: { permissions: [{ permission: { code: "CASH_MANAGE" } }] },
          },
        ],
      }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
    $transaction: jest
      .fn()
      .mockImplementation(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
  };
  const audit = { recordInTransaction: jest.fn().mockResolvedValue(undefined) };
  return {
    tx,
    prisma,
    audit,
    service: new CashService(prisma as never, audit as never),
  };
}

describe("cash closing and manual movement safeguards", () => {
  it("blocks manual movements according to branch rules", async () => {
    const { tx, service } = setup();
    tx.cashSettings.findUnique.mockResolvedValue({
      allowManualMovements: false,
    });
    await expect(
      service.movement("actor", "org", "branch", "session", {
        type: "IN",
        amountMinor: 100,
        reason: "Ingreso",
      }),
    ).rejects.toThrow("deshabilitados");
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
  it("allows a blank reason only when branch rules allow it", async () => {
    const { tx, service } = setup();
    tx.cashSettings.findUnique.mockResolvedValue({
      allowManualMovements: true,
      requireMovementReason: false,
    });
    await service.movement("actor", "org", "branch", "session", {
      type: "IN",
      amountMinor: 100,
      reason: "",
    });
    expect(tx.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "", amountMinor: 100n }),
    });
  });
  it("closes 16000 expected with 15500 counted and audits a 500 shortage", async () => {
    const { service, tx, audit } = setup();
    const result = await service.close("actor", "org", "branch", "session", {
      closingAmountMinor: 1550000,
      expectedAmountMinor: 1600000,
      reason: "Diferencia de conteo",
    });
    expect(result.differenceMinor).toBe("-50000");
    expect(tx.salePayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cashSessionId: "session",
          method: "CASH",
          sale: { status: "COMPLETED" },
        },
      }),
    );
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: "actor",
        action: "CLOSED",
        after: expect.objectContaining({
          differenceMinor: "-50000",
          reason: "Diferencia de conteo",
        }),
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.cashSession.findFirst.mock.invocationCallOrder[0]!,
    );
  });
  it("requires a reason for a difference without updating the session", async () => {
    const { service, tx } = setup();
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 1550000,
      }),
    ).rejects.toThrow("motivo");
    expect(tx.cashSession.update).not.toHaveBeenCalled();
  });
  it("allows an exact count without a reason", async () => {
    const { service } = setup();
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 1600000,
      }),
    ).resolves.toMatchObject({ differenceMinor: "0" });
  });
  it("rejects a changed expected balance", async () => {
    const { service, tx } = setup();
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 1550000,
        expectedAmountMinor: 1500000,
        reason: "Conteo",
      }),
    ).rejects.toThrow("cambió");
    expect(tx.cashSession.update).not.toHaveBeenCalled();
  });
  it("rejects a second close and movements in an already closed session", async () => {
    const { service, tx } = setup();
    tx.cashSession.findFirst.mockResolvedValue(null);
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 0,
      }),
    ).rejects.toThrow("cerrada");
    await expect(
      service.movement("actor", "org", "branch", "session", {
        type: "IN",
        amountMinor: 100,
        reason: "Ingreso",
      }),
    ).rejects.toThrow("cerrada");
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
  it("reuses a retried manual movement without duplicating it or its audit", async () => {
    const { service, tx, audit } = setup();
    const input = {
      type: "IN" as const,
      amountMinor: 100,
      reason: "Ingreso",
      clientOperationId: "request",
    };
    tx.cashMovement.findUnique.mockResolvedValue({
      id: "request",
      cashSessionId: "session",
      actorId: "actor",
      type: "IN",
      amountMinor: 100n,
      reason: "Ingreso",
    });
    await expect(
      service.movement("actor", "org", "branch", "session", input),
    ).resolves.toMatchObject({ id: "request", amountMinor: "100" });
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });
  it("rejects a reused request with a different payload", async () => {
    const { service, tx } = setup();
    tx.cashMovement.findUnique.mockResolvedValue({
      cashSessionId: "different",
    });
    await expect(
      service.movement("actor", "org", "branch", "session", {
        type: "IN",
        amountMinor: 100,
        reason: "Ingreso",
        clientOperationId: "request",
      }),
    ).rejects.toThrow("otro movimiento");
  });
  it("rejects missing permission before accessing cash", async () => {
    const { service, prisma } = setup();
    prisma.userOrganization.findUnique.mockResolvedValue({
      active: true,
      roles: [],
    });
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 0,
      }),
    ).rejects.toThrow("permission");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a register outside the requested branch", async () => {
    const { service, tx } = setup();
    tx.cashRegister.findFirst.mockResolvedValue(null);
    await expect(
      service.close("actor", "org", "branch", "session", {
        closingAmountMinor: 0,
      }),
    ).rejects.toThrow("sucursal");
    expect(tx.cashSession.update).not.toHaveBeenCalled();
  });
});
