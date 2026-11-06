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
      cancel: (saleId: string) => Promise<unknown>;
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
            where: { code: { in: ["SALE_MANAGE", "SALE_READ", "CASH_READ"] } },
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
          await run({
            tx,
            sell: (paidMinor) =>
              sales.complete(user.id, org.id, branch.id, {
                clientOperationId: randomUUID(),
                items: [
                  {
                    description: "Cobro puntual",
                    quantity: 1,
                    unitPriceMinor: 800,
                  },
                ],
                payments: [
                  {
                    method: "CASH" as const,
                    amountMinor: paidMinor,
                    cashSessionId: session.id,
                  },
                ],
              }),
            cancel: (saleId) =>
              sales.cancel(
                user.id,
                org.id,
                branch.id,
                saleId,
                "Error de carga",
              ),
            expected: async () =>
              (await cash.list(user.id, org.id, branch.id)).sessions.find(
                (row) => row.id === session.id,
              )!.expectedAmountMinor,
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

  it("no crea movimientos al anular una venta sin vuelto", async () => {
    await withFixture(async ({ sell, cancel, expected, movements }) => {
      const sale = await sell(800);
      await cancel(sale.id);
      expect(await expected()).toBe("1000");
      expect(await movements()).toEqual([]);
    });
  });
});
