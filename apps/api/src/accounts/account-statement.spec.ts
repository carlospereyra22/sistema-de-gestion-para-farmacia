import { AccountsService } from "./accounts.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
function setup(authorized = true, branchAccess = true) {
  const findMany = jest.fn().mockResolvedValue([
    {
      id: "client",
      name: "Abel",
      accountMovements: [
        { id: "1", type: "DEBIT", amountMinor: 10000n, saleId: "sale" },
        { id: "2", type: "CREDIT", amountMinor: 4000n },
        { id: "3", type: "CREDIT", amountMinor: 7000n },
      ],
    },
  ]);
  const tx = {
    userBranch: {
      findFirst: jest
        .fn()
        .mockResolvedValue(branchAccess ? { id: "access" } : null),
    },
    customer: { findMany },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue(
        authorized
          ? {
              active: true,
              roles: [
                {
                  role: {
                    permissions: [{ permission: { code: "ACCOUNT_READ" } }],
                  },
                },
              ],
            }
          : null,
      ),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  return {
    service: new AccountsService(
      prisma as unknown as PrismaService,
      {} as AuditService,
    ),
    prisma,
    tx,
    findMany,
  };
}
it("scopes and orders the ledger and calculates exact running balances including credits", async () => {
  const { service, findMany, tx, prisma } = setup();
  const result = await service.statement("actor", "org", "branch");
  expect(result[0]!.movements.map((m) => m.balanceMinor)).toEqual([
    "10000",
    "6000",
    "-1000",
  ]);
  expect(tx.userBranch.findFirst).toHaveBeenCalledWith({
    where: {
      userId: "actor",
      branchId: "branch",
      branch: { organizationId: "org" },
    },
  });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { organizationId: "org" },
      select: expect.objectContaining({
        accountMovements: expect.objectContaining({
          where: { organizationId: "org", branchId: "branch" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      }),
    }),
  );
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  });
});
it("rejects missing account permission and branch access before reading customers", async () => {
  for (const args of [
    [false, true],
    [true, false],
  ]) {
    const { service, findMany } = setup(...args);
    await expect(service.statement("actor", "org", "branch")).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  }
});
it("marks price and manual increases as internal, without dropping them from the balance", async () => {
  const { service, findMany } = setup();
  findMany.mockResolvedValue([
    {
      id: "client",
      accountMovements: [
        {
          id: "sale",
          type: "DEBIT",
          saleId: "sale",
          amountMinor: 100n,
          allocations: null,
        },
        {
          id: "price",
          type: "DEBIT",
          saleId: "sale",
          amountMinor: 50n,
          allocations: { kind: "PRICE_ADJUSTMENT" },
        },
        {
          id: "manual",
          type: "DEBIT",
          saleId: "sale",
          amountMinor: 50n,
          allocations: { kind: "MANUAL_DEBT_ADJUSTMENT" },
        },
        {
          id: "receipt",
          type: "CREDIT",
          saleId: null,
          amountMinor: 20n,
          allocations: [],
        },
        {
          id: "reversal",
          type: "CREDIT",
          saleId: "sale",
          amountMinor: 180n,
          allocations: null,
        },
      ],
    },
  ]);
  const result = await service.statement("actor", "org", "branch");
  expect(result[0]!.movements.map((m) => m.showInStatement)).toEqual([
    true,
    false,
    false,
    true,
    false,
  ]);
  expect(result[0]!.movements.map((m) => m.balanceMinor)).toEqual([
    "100",
    "150",
    "200",
    "180",
    "0",
  ]);
});
