import { CashService } from "./cash.service";
import {
  assertCollectionSession,
  defaultCashSettings,
  readCashSettings,
} from "./cash-settings";

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    cashSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation(
          async ({ create }: { create: Record<string, unknown> }) => create,
        ),
    },
    cashRegister: {
      findFirst: jest.fn().mockResolvedValue({ id: "register" }),
      findMany: jest.fn().mockResolvedValue([{ id: "register" }]),
    },
    cashSession: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...tx,
    branch: { findFirst: jest.fn().mockResolvedValue({ id: "branch" }) },
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
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const audit = { recordInTransaction: jest.fn() };
  const service = new CashService(prisma as never, audit as never);
  return { tx, prisma, audit, service };
}
describe("branch cash rules", () => {
  it("defaults preserve existing behavior without creating records", async () => {
    const { tx } = setup();
    expect(await readCashSettings(tx as never, "branch")).toEqual(
      defaultCashSettings,
    );
    await expect(
      assertCollectionSession(tx as never, "branch"),
    ).resolves.toBeUndefined();
    expect(tx.cashSettings.upsert).not.toHaveBeenCalled();
  });
  it("rejects missing session for all collected payment methods when disabled", async () => {
    const { tx } = setup();
    tx.cashSettings.findUnique.mockResolvedValue({
      ...defaultCashSettings,
      allowWithoutSession: false,
    });
    await expect(
      assertCollectionSession(tx as never, "branch"),
    ).rejects.toThrow("caja abierta");
    await expect(
      assertCollectionSession(tx as never, "branch", "session"),
    ).resolves.toBeUndefined();
    await expect(
      assertCollectionSession(tx as never, "branch", undefined, true),
    ).rejects.toThrow("caja abierta");
    tx.cashSession.findFirst.mockResolvedValue({ id: "session" });
    await expect(
      assertCollectionSession(tx as never, "branch", undefined, true),
    ).resolves.toBeUndefined();
  });
  it("saves branch-scoped rules with audit and without leaking storage fields", async () => {
    const { tx, service, audit } = setup();
    const result = await service.saveSettings("actor", "org", "branch", {
      ...defaultCashSettings,
      defaultRegisterId: "register",
      allowManualMovements: false,
    });
    expect(result).toEqual({
      ...defaultCashSettings,
      defaultRegisterId: "register",
      allowManualMovements: false,
      version: 1,
    });
    expect(tx.cashRegister.findFirst).toHaveBeenCalledWith({
      where: { id: "register", branchId: "branch", active: true },
    });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: "org",
        branchId: "branch",
        actorId: "actor",
        action: "UPDATED",
      }),
    );
  });
  it("rejects a stale edit but accepts an identical retry", async () => {
    const { tx, service } = setup();
    tx.cashSettings.findUnique.mockResolvedValue({
      ...defaultCashSettings,
      version: 2,
    });
    await expect(
      service.saveSettings("actor", "org", "branch", {
        ...defaultCashSettings,
        allowWithoutSession: false,
      }),
    ).rejects.toThrow("cambiaron");
    await expect(
      service.saveSettings("actor", "org", "branch", {
        ...defaultCashSettings,
      }),
    ).resolves.toMatchObject({ version: 2 });
    expect(tx.cashSettings.upsert).not.toHaveBeenCalled();
  });
  it("rejects a foreign or disabled default register", async () => {
    const { tx, service } = setup();
    tx.cashRegister.findFirst.mockResolvedValue(null);
    await expect(
      service.saveSettings("actor", "org", "branch", {
        ...defaultCashSettings,
        defaultRegisterId: "other",
      }),
    ).rejects.toThrow("habilitada");
    expect(tx.cashSettings.upsert).not.toHaveBeenCalled();
  });
  it("requires manage permission", async () => {
    const { prisma, tx, service } = setup();
    prisma.userOrganization.findUnique.mockResolvedValue(null);
    await expect(
      service.saveSettings("actor", "org", "branch", defaultCashSettings),
    ).rejects.toThrow();
    expect(tx.cashSettings.upsert).not.toHaveBeenCalled();
  });
});
