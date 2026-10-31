import { CashService } from "./cash.service";

describe("CashService", () => {
  it("includes the expected cash and the difference in a listed session", async () => {
    const prisma = {
      cashSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      userOrganization: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          roles: [
            {
              role: {
                permissions: [{ permission: { code: "CASH_READ" } }],
              },
            },
          ],
        }),
      },
      cashRegister: {
        findMany: jest.fn().mockResolvedValue([{ id: "register-1" }]),
      },
      cashSession: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: "session-1",
              cashRegisterId: "register-1",
              openedAt: new Date("2026-09-08T09:00:00.000Z"),
              closedAt: new Date("2026-09-08T17:00:00.000Z"),
              openingAmountMinor: 10000n,
              closingAmountMinor: 28000n,
              movements: [
                {
                  id: "movement-1",
                  type: "IN",
                  amountMinor: 5000n,
                  reason: "Cambio",
                  createdAt: new Date("2026-09-08T10:00:00.000Z"),
                },
                {
                  id: "movement-2",
                  type: "OUT",
                  amountMinor: 1000n,
                  reason: "Gasto",
                  createdAt: new Date("2026-09-08T11:00:00.000Z"),
                },
              ],
            },
          ]),
      },
      salePayment: {
        groupBy: jest.fn().mockResolvedValue([
          {
            cashSessionId: "session-1",
            _sum: { amountMinor: 15000n },
          },
        ]),
      },
    };
    const service = new CashService(prisma as never, {} as never);

    await expect(
      service.list("user-1", "organization-1", "branch-1"),
    ).resolves.toMatchObject({
      sessions: [
        {
          openingAmountMinor: "10000",
          cashSalesMinor: "15000",
          manualInMinor: "5000",
          manualOutMinor: "1000",
          expectedAmountMinor: "29000",
          differenceMinor: "-1000",
        },
      ],
    });
    expect(prisma.cashSession.findMany.mock.calls[0]![0]).not.toHaveProperty(
      "take",
    );
    expect(prisma.cashSession.findMany.mock.calls[0]![0]).toMatchObject({
      where: { closedAt: null },
    });
  });
});
