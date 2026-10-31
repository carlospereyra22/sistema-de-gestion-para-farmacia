import { settlementAdjustments } from "./settlement-adjustments";
import { AccountsService } from "./accounts.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { Prisma } from "@prisma/client";

function setup() {
  const create = jest.fn(
    async ({
      data,
    }: {
      data: Prisma.CustomerAccountMovementUncheckedCreateInput;
    }) => ({ id: "receipt", ...data }),
  );
  const tx = {
    cashSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    cashPendingCollection: { create: jest.fn().mockResolvedValue({}) },
    customerAccountMovement: {
      create,
      findUnique: jest.fn().mockResolvedValue(null),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({
        name: "Abel",
        accountMovements: [{ type: "DEBIT", amountMinor: 100000n }],
      }),
    },
    sale: {
      findFirst: jest.fn().mockResolvedValue({
        id: "sale",
        branchId: "branch",
        customerReturns: [],
      }),
    },
    cashSession: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        active: true,
        roles: [
          {
            role: {
              permissions: [{ permission: { code: "ACCOUNT_MANAGE" } }],
            },
          },
        ],
      }),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const audit = { recordInTransaction: jest.fn().mockResolvedValue(undefined) };
  const service = new AccountsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  const internal = service as unknown as {
    itemBalances: () => Promise<unknown>;
    receiptData: () => Promise<unknown>;
  };
  const detail = jest.spyOn(internal, "itemBalances").mockResolvedValue({
    items: [{ saleItemId: "item", saleId: "sale", pendingMinor: "100000" }],
    unassignedReceipts: [],
    mixedSales: [],
  });
  jest.spyOn(internal, "receiptData").mockResolvedValue({});
  const pay = (
    amount: number,
    expected = 100000,
    method: "TRANSFER" | "CASH" = "TRANSFER",
  ) =>
    service.pay(
      "user",
      "org",
      "branch",
      "customer",
      amount,
      method,
      undefined,
      undefined,
      "operation",
      [
        {
          saleItemId: "item",
          amountMinor: amount,
          expectedPendingMinor: expected,
        },
      ],
    );
  return { tx, prisma, audit, service, pay, detail };
}
describe("final account settlement", () => {
  it("supports a partial collection against an independently adjusted balance", () => {
    expect(
      settlementAdjustments(
        [
          {
            saleItemId: "item",
            amountMinor: 20000,
            expectedPendingMinor: 100000,
            nextPendingMinor: 80000,
          },
        ],
        new Map([["item", 100000n]]),
      ),
    ).toEqual([
      { saleItemId: "item", before: 100000n, after: 80000n, delta: -20000n },
    ]);
    expect(() =>
      settlementAdjustments(
        [
          {
            saleItemId: "item",
            amountMinor: 90000,
            expectedPendingMinor: 100000,
            nextPendingMinor: 80000,
          },
        ],
        new Map([["item", 100000n]]),
      ),
    ).toThrow();
    expect(() =>
      settlementAdjustments(
        [{ saleItemId: "item", amountMinor: 20000, nextPendingMinor: 80000 }],
        new Map([["item", 100000n]]),
      ),
    ).toThrow();
  });
  it("allows up then down against the original pending balance without persisting the draft", () => {
    const pending = new Map([["item", 100000n]]);
    for (const amount of [120000, 80000, 110000, 50000]) {
      expect(
        settlementAdjustments(
          [
            {
              saleItemId: "item",
              amountMinor: amount,
              expectedPendingMinor: 100000,
            },
          ],
          pending,
        )[0]?.delta,
      ).toBe(BigInt(amount) - 100000n);
      expect(pending.get("item")).toBe(100000n);
    }
  });
  it.each([80000, 120000])(
    "records adjustment and receipt in the same serializable transaction: %s",
    async (amount) => {
      const { pay, tx, prisma } = setup();
      await pay(amount);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
      expect(
        tx.customerAccountMovement.create.mock.calls[0]![0].data,
      ).toMatchObject({
        type: amount < 100000 ? "CREDIT" : "DEBIT",
        amountMinor: 20000n,
        saleId: "sale",
        allocations: { kind: "MANUAL_DEBT_ADJUSTMENT" },
      });
      expect(
        tx.customerAccountMovement.create.mock.calls[1]![0].data,
      ).toMatchObject({
        type: "CREDIT",
        amountMinor: BigInt(amount),
        clientOperationId: "operation",
      });
    },
  );
  it("retries the same receipt without writing adjustments twice", async () => {
    const { pay, tx } = setup();
    await pay(80000);
    const stored = tx.customerAccountMovement.create.mock.calls[1]![0].data;
    tx.customerAccountMovement.findUnique.mockResolvedValue({
      id: "receipt",
      ...stored,
    });
    await pay(80000);
    expect(tx.customerAccountMovement.create).toHaveBeenCalledTimes(2);
    await expect(pay(80000, 120000)).rejects.toThrow("otra selección");
  });
  it("records cash without a session as pending, once on retry", async () => {
    const { pay, tx } = setup();
    await pay(100000, 100000, "CASH");
    const stored = tx.customerAccountMovement.create.mock.calls[0]![0].data;
    tx.customerAccountMovement.findUnique.mockResolvedValue({
      id: "receipt",
      ...stored,
    });
    await pay(100000, 100000, "CASH");
    expect(tx.cashPendingCollection.create).toHaveBeenCalledTimes(1);
    expect(tx.cashPendingCollection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: "RECEIPT",
        cashMinor: 100000n,
      }),
    });
  });
  it("rejects changed balances and unauthorized items before writing", async () => {
    const { pay, tx, detail } = setup();
    await expect(pay(80000, 90000)).rejects.toThrow("Cambió el saldo");
    detail.mockResolvedValue({
      items: [],
      unassignedReceipts: [],
      mixedSales: [],
    });
    await expect(pay(80000)).rejects.toThrow("Cambió el saldo");
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });
  it("rejects returned sales and aborts when receipt creation fails", async () => {
    const { pay, tx } = setup();
    tx.sale.findFirst.mockResolvedValueOnce({
      id: "sale",
      branchId: "branch",
      customerReturns: [{ id: "return" }],
    });
    await expect(pay(80000)).rejects.toThrow("devoluciones");
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
    tx.customerAccountMovement.create
      .mockImplementationOnce(async ({ data }) => ({
        id: "adjustment",
        ...data,
      }))
      .mockRejectedValueOnce(new Error("receipt failure"));
    await expect(pay(80000)).rejects.toThrow("receipt failure");
  });
  it("keeps partial deliveries free of debt adjustments", () => {
    expect(
      settlementAdjustments(
        [{ saleItemId: "item", amountMinor: 80000 }],
        new Map([["item", 100000n]]),
      ),
    ).toEqual([]);
  });
});
