import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CashService } from "../src/cash/cash.service";
import { SalesService } from "../src/sales/sales.service";

describe("vuelto de ventas anuladas (base local, fixtures con rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });

  const withFixture = async (
    run: (fixture: {
      tx: Prisma.TransactionClient;
      sell: (paidMinor: number) => ReturnType<SalesService["complete"]>;
      sellWith: (
        payments: {
          method: "CASH" | "CARD" | "TRANSFER";
          amountMinor: number;
        }[],
      ) => ReturnType<SalesService["complete"]>;
      cancel: (saleId: string) => Promise<unknown>;
      current: () => Promise<
        Awaited<ReturnType<CashService["list"]>>["sessions"][number]
      >;
      withdraw: (amountMinor: number) => ReturnType<CashService["movement"]>;
      recent: () => ReturnType<CashService["recentActivity"]>;
      sessionId: string;
      expected: () => Promise<string>;
      movements: () => Promise<
        { type: string; amountMinor: bigint; reason: string }[]
      >;
    }) => Promise<void>,
  ) => {
    const rollback = new Error("ROLLBACK_CASH_CHANGE");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Vuelto fixture" },
          });
          const branch = await tx.branch.create({
            data: { organizationId: org.id, name: "Test", code: "TEST" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "test",
            },
          });
          const permissions = await tx.permission.findMany({
            where: {
              code: {
                in: ["SALE_MANAGE", "SALE_READ", "CASH_READ", "CASH_MANAGE"],
              },
            },
          });
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Test",
              code: "TEST",
              permissions: {
                create: permissions.map((p) => ({ permissionId: p.id })),
              },
            },
          });
          await tx.userOrganization.create({
            data: {
              organizationId: org.id,
              userId: user.id,
              roles: { create: { roleId: role.id } },
            },
          });
          await tx.priceList.create({
            data: { organizationId: org.id, name: "Precio general" },
          });
          const register = await tx.cashRegister.create({
            data: { branchId: branch.id, name: "Test" },
          });
          const session = await tx.cashSession.create({
            data: {
              cashRegisterId: register.id,
              openedById: user.id,
              openingAmountMinor: 1000n,
            },
          });
          const scoped = new Proxy(tx, {
            get(target, key) {
              return key === "$transaction"
                ? (
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          const audit = new AuditService(scoped);
          const sales = new SalesService(scoped, audit);
          const cash = new CashService(scoped, audit);
          const sellWith = (
            payments: {
              method: "CASH" | "CARD" | "TRANSFER";
              amountMinor: number;
            }[],
          ) =>
            sales.complete(user.id, org.id, branch.id, {
              clientOperationId: randomUUID(),
              items: [
                {
                  description: "Cobro puntual",
                  quantity: 1,
                  unitPriceMinor: 800,
                },
              ],
              payments: payments.map((payment) => ({
                ...payment,
                cashSessionId: session.id,
              })),
            });
          const current = async () =>
            (await cash.list(user.id, org.id, branch.id)).sessions.find(
              (row) => row.id === session.id,
            )!;
          await run({
            tx,
            sellWith,
            current,
            sessionId: session.id,
            recent: () =>
              cash.recentActivity(user.id, org.id, branch.id, register.id),
            sell: (paidMinor) =>
              sellWith([{ method: "CASH", amountMinor: paidMinor }]),
            withdraw: (amountMinor) =>
              cash.movement(user.id, org.id, branch.id, session.id, {
                type: "OUT",
                amountMinor,
                reason: "Retiro",
              }),
            cancel: (saleId) =>
              sales.cancel(
                user.id,
                org.id,
                branch.id,
                saleId,
                "Error de carga",
              ),
            expected: async () => (await current()).expectedAmountMinor,
            movements: () =>
              tx.cashMovement.findMany({
                where: { cashSessionId: session.id },
                orderBy: { createdAt: "asc" },
              }),
          });
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  };

  it("anular una venta con vuelto devuelve el esperado al fondo inicial", async () => {
    await withFixture(async ({ sell, cancel, expected, movements }) => {
      const sale = await sell(1000);
      expect(await expected()).toBe("1800");
      await cancel(sale.id);
      expect(await expected()).toBe("1000");
      expect(await movements()).toEqual([
        expect.objectContaining({
          type: "OUT",
          amountMinor: 200n,
          reason: `Vuelto de venta ${sale.id}`,
        }),
        expect.objectContaining({
          type: "IN",
          amountMinor: 200n,
          reason: `Anulación de vuelto · Venta ${sale.id}: Error de carga`,
        }),
      ]);
    });
  });

  it("compensa también el vuelto registrado con el texto anterior", async () => {
    await withFixture(async ({ tx, sell, cancel, expected }) => {
      const sale = await sell(1000);
      await tx.cashMovement.updateMany({
        where: { reason: `Vuelto de venta ${sale.id}` },
        data: { reason: `Change for sale ${sale.id}` },
      });
      await cancel(sale.id);
      expect(await expected()).toBe("1000");
    });
  });

  it("separa los medios de pago sin sumarlos al efectivo", async () => {
    await withFixture(async ({ sellWith, current }) => {
      await sellWith([
        { method: "CASH", amountMinor: 300 },
        { method: "CARD", amountMinor: 300 },
        { method: "TRANSFER", amountMinor: 200 },
      ]);
      expect(await current()).toMatchObject({
        expectedAmountMinor: "1300",
        cashSalesMinor: "300",
        cardMinor: "300",
        transferMinor: "200",
        saleChangeMinor: "0",
      });
    });
  });

  it("la línea de tiempo explica el saldo y refleja la anulación", async () => {
    await withFixture(async ({ sell, cancel, current }) => {
      const kept = await sell(800);
      const cancelled = await sell(1000);
      const before = await current();
      expect(before.saleChangeMinor).toBe("200");
      expect(before.cashPayments.map((row) => row.saleId).sort()).toEqual(
        [kept.id, cancelled.id].sort(),
      );
      expect(before.movements).toEqual([
        expect.objectContaining({ category: "SALE_CHANGE" }),
      ]);
      const entries =
        BigInt(before.openingAmountMinor) +
        before.cashPayments.reduce(
          (sum, row) => sum + BigInt(row.amountMinor),
          0n,
        ) -
        BigInt(before.movements[0]!.amountMinor);
      expect(entries.toString()).toBe(before.expectedAmountMinor);
      await cancel(cancelled.id);
      const after = await current();
      expect(after.saleChangeMinor).toBe("0");
      expect(after.cashPayments.map((row) => row.saleId)).toEqual([kept.id]);
    });
  });

  it("rechaza el egreso que supera el efectivo y permite retirarlo todo", async () => {
    await withFixture(async ({ sell, withdraw, expected }) => {
      await sell(800);
      await expect(withdraw(1801)).rejects.toThrow(
        "El egreso supera el efectivo disponible en caja ($ 18,00).",
      );
      expect(await expected()).toBe("1800");
      await withdraw(1800);
      expect(await expected()).toBe("0");
    });
  });

  it("el vuelto puede salir aunque no haya fondo suficiente", async () => {
    await withFixture(async ({ withdraw, sell, expected }) => {
      await withdraw(1000);
      await sell(1000);
      expect(await expected()).toBe("800");
    });
  });

  describe("actividad reciente de la caja", () => {
    const days = (amount: number) => new Date(Date.now() - amount * 86_400_000);

    it("muestra lo de una sesión cerrada en los últimos 7 días", async () => {
      await withFixture(async ({ tx, sell, cancel, recent, sessionId }) => {
        const kept = await sell(1000);
        const cancelled = await sell(800);
        await cancel(cancelled.id);
        await tx.cashSession.update({
          where: { id: sessionId },
          data: { closedAt: new Date(), closingAmountMinor: 1800n },
        });
        const activity = await recent();
        expect(activity.cashPayments.map((row) => row.saleId)).toEqual([
          kept.id,
        ]);
        expect(activity.movements).toEqual([
          expect.objectContaining({
            category: "SALE_CHANGE",
            amountMinor: "200",
          }),
        ]);
      });
    });

    it("deja afuera lo anterior a 7 días", async () => {
      await withFixture(async ({ tx, sell, recent, sessionId }) => {
        const sale = await sell(1000);
        await tx.cashMovement.updateMany({
          where: { cashSessionId: sessionId },
          data: { createdAt: days(8) },
        });
        await tx.salePayment.updateMany({
          where: { saleId: sale.id },
          data: { createdAt: days(8) },
        });
        expect(await recent()).toEqual({ movements: [], cashPayments: [] });
      });
    });

    it("no muestra cierres eliminados del listado", async () => {
      await withFixture(async ({ tx, sell, recent, sessionId }) => {
        await sell(1000);
        await tx.cashSession.update({
          where: { id: sessionId },
          data: { closedAt: new Date(), archivedAt: new Date() },
        });
        expect(await recent()).toEqual({ movements: [], cashPayments: [] });
      });
    });
  });

  it("no crea movimientos al anular una venta sin vuelto", async () => {
    await withFixture(async ({ sell, cancel, expected, movements }) => {
      const sale = await sell(800);
      await cancel(sale.id);
      expect(await expected()).toBe("1000");
      expect(await movements()).toEqual([]);
    });
  });
});
