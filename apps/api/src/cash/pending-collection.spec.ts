import { pendingAmounts, recordPendingCollection } from "./pending-collection";
import { CashService } from "./cash.service";

const row = {
  id: "pending",
  sourceType: "SALE",
  sourceId: "sale",
  collectedAt: new Date("2026-10-17T10:00:00Z"),
  cashMinor: 800n,
  cardMinor: 200n,
  transferMinor: 300n,
  changeMinor: 100n,
  assignedAt: null as Date | null,
  assignedSessionId: null as string | null,
  voidedAt: null as Date | null,
  destinationRegisterId: null as string | null,
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cashPendingCollection: {
      findFirst: jest.fn().mockResolvedValue({ ...row }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row }),
      update: jest.fn().mockResolvedValue({}),
    },
    sale: { findFirst: jest.fn().mockResolvedValue({ id: "sale" }) },
    cashSession: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "session", cashRegisterId: "register" }),
    },
    cashRegister: {
      findFirst: jest.fn().mockResolvedValue({ id: "register" }),
    },
    cashMovement: { create: jest.fn().mockResolvedValue({}) },
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
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const audit = { recordInTransaction: jest.fn() };
  const service = new CashService(prisma as never, audit as never);
  const assign = () =>
    service.assignCollection("actor", "org", "branch", "pending", "session");
  const destination = () =>
    service.setCollectionDestination(
      "actor",
      "org",
      "branch",
      "pending",
      "register",
    );
  return { tx, audit, prisma, assign, destination };
}
describe("pending collections", () => {
  it("assigns a closed register without opening sessions or moving cash", async () => {
    const { tx, destination, audit } = setup();
    tx.cashSession.findFirst.mockResolvedValue(null);
    await destination();
    expect(tx.cashSession.findFirst).not.toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(tx.cashPendingCollection.update).toHaveBeenCalledWith({
      where: { id: "pending" },
      data: expect.objectContaining({
        destinationRegisterId: "register",
        destinationSetById: "actor",
      }),
    });
    expect(audit.recordInTransaction).toHaveBeenCalledTimes(1);
    tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
      ...row,
      destinationRegisterId: "register",
    });
    await destination();
    expect(tx.cashPendingCollection.update).toHaveBeenCalledTimes(1);
    expect(audit.recordInTransaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    "other-destination",
    "inactive-or-foreign",
    "voided",
    "incorporated",
    "no-permission",
  ])("rejects destination %s without mutation", async (condition) => {
    const { tx, destination, prisma } = setup();
    if (condition === "other-destination")
      tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
        ...row,
        destinationRegisterId: "other",
      });
    if (condition === "inactive-or-foreign")
      tx.cashRegister.findFirst.mockResolvedValue(null);
    if (condition === "voided")
      tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
        ...row,
        voidedAt: new Date(),
      });
    if (condition === "incorporated")
      tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
        ...row,
        assignedAt: new Date(),
      });
    if (condition === "no-permission")
      prisma.userOrganization.findUnique.mockResolvedValue(null);
    await expect(destination()).rejects.toThrow();
    expect(tx.cashPendingCollection.update).not.toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
  it("rejects incorporation into a different register", async () => {
    const { tx, assign } = setup();
    tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
      ...row,
      destinationRegisterId: "other",
    });
    await expect(assign()).rejects.toThrow("caja asignada");
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
  it("separates tenders, deducts change and excludes financing", () => {
    expect(
      pendingAmounts(
        [
          { method: "CASH", amountMinor: 900 },
          { method: "CARD", amountMinor: 200 },
          { method: "TRANSFER", amountMinor: 300 },
          { method: "ACCOUNT", amountMinor: 500 },
        ],
        100n,
      ),
    ).toEqual({
      cashMinor: 800n,
      cardMinor: 200n,
      transferMinor: 300n,
      changeMinor: 100n,
    });
    expect(() => pendingAmounts([], 1n)).toThrow();
  });
  it("does not create a collection for financing alone", async () => {
    const tx = { cashPendingCollection: { create: jest.fn() } };
    await recordPendingCollection(
      tx as never,
      {
        organizationId: "o",
        branchId: "b",
        actorId: "a",
        sourceType: "SALE",
        sourceId: "s",
      },
      [{ method: "ACCOUNT", amountMinor: 100 }],
    );
    expect(tx.cashPendingCollection.create).not.toHaveBeenCalled();
  });
  it("assigns only net cash and audits original date and all tenders", async () => {
    const { tx, audit, assign } = setup();
    await assign();
    expect(tx.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountMinor: 800n,
        type: "IN",
        cashSessionId: "session",
      }),
    });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        after: expect.objectContaining({
          collectedAt: row.collectedAt.toISOString(),
          cardMinor: "200",
          transferMinor: "300",
        }),
      }),
    );
    expect(tx.cashRegister.findFirst).toHaveBeenCalledWith({
      where: { id: "register", branchId: "branch", active: true },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[2]!).toBeLessThan(
      tx.cashMovement.create.mock.invocationCallOrder[0]!,
    );
  });
  it("assigns electronic-only collections without a cash movement", async () => {
    const { tx, assign } = setup();
    tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
      ...row,
      cashMinor: 0n,
    });
    await assign();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(tx.cashPendingCollection.update).toHaveBeenCalledTimes(1);
  });
  it("returns the original assignment on retry without writes", async () => {
    const { tx, assign, audit } = setup();
    tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
      ...row,
      assignedAt: new Date(),
      assignedSessionId: "session",
    });
    await assign();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
    expect(tx.cashPendingCollection.update).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });
  it.each([
    "other-session",
    "voided",
    "closed",
    "wrong-branch",
    "missing",
    "cancelled-sale",
  ])("rejects %s without movement", async (condition) => {
    const { tx, assign } = setup();
    if (condition === "other-session")
      tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
        ...row,
        assignedAt: new Date(),
        assignedSessionId: "other",
      });
    if (condition === "voided")
      tx.cashPendingCollection.findUniqueOrThrow.mockResolvedValue({
        ...row,
        voidedAt: new Date(),
      });
    if (condition === "closed")
      tx.cashSession.findFirst.mockResolvedValue(null);
    if (condition === "wrong-branch")
      tx.cashRegister.findFirst.mockResolvedValue(null);
    if (condition === "missing")
      tx.cashPendingCollection.findFirst.mockResolvedValue(null);
    if (condition === "cancelled-sale")
      tx.sale.findFirst.mockResolvedValue(null);
    await expect(assign()).rejects.toThrow();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
});
