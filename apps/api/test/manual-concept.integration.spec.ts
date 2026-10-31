import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { SalesService } from "../src/sales/sales.service";
import { AccountsService } from "../src/accounts/accounts.service";

describe("manual concepts (local DB, rollback fixtures)", () => {
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
  it("collects mixed sales once, prints concepts, and restores only real stock on cancellation", async () => {
    const rollback = new Error("ROLLBACK_CONCEPTS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Concept fixture" },
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
            where: { code: { in: ["SALE_MANAGE", "SALE_READ"] } },
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
          const product = await tx.product.create({
            data: { organizationId: org.id, name: "Catalog product" },
          });
          const list = await tx.priceList.create({
            data: { organizationId: org.id, name: "Precio general" },
          });
          await tx.productPrice.create({
            data: {
              productId: product.id,
              priceListId: list.id,
              amountMinor: 100n,
            },
          });
          const lot = await tx.productLot.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              productId: product.id,
              number: "TEST",
              quantity: 10,
              unitCostMinor: 50n,
            },
          });
          const register = await tx.cashRegister.create({
            data: { branchId: branch.id, name: "Test" },
          });
          const session = await tx.cashSession.create({
            data: {
              cashRegisterId: register.id,
              openedById: user.id,
              openingAmountMinor: 0n,
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
          const sales = new SalesService(scoped, new AuditService(scoped));
          const input = {
            clientOperationId: randomUUID(),
            items: [
              { productId: product.id, quantity: 2 },
              {
                description: "Cobro puntual",
                quantity: 3,
                unitPriceMinor: 500,
                discountMinor: 50,
              },
            ],
            payments: [
              {
                method: "CASH" as const,
                amountMinor: 1650,
                cashSessionId: session.id,
              },
            ],
          };
          const sale = await sales.complete(user.id, org.id, branch.id, input);
          expect(sale.totalMinor).toBe("1650");
          expect(
            (await sales.complete(user.id, org.id, branch.id, input)).id,
          ).toBe(sale.id);
          expect(
            await tx.salePayment.count({ where: { saleId: sale.id } }),
          ).toBe(1);
          expect(
            await tx.product.count({ where: { organizationId: org.id } }),
          ).toBe(1);
          expect(
            (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
              .quantity,
          ).toBe(8);
          expect(
            await tx.inventoryMovement.count({
              where: { referenceId: sale.id },
            }),
          ).toBe(1);
          const ticket = await sales.ticket(
            user.id,
            org.id,
            branch.id,
            sale.id,
          );
          expect(
            ticket.items.some(
              (item) =>
                item.name === "Cobro puntual" &&
                item.unitPriceMinor === "500" &&
                item.quantity === 3 &&
                item.amountMinor === "1500",
            ),
          ).toBe(true);
          const concept = sale.items.find((item) => !item.productId)!;
          await expect(
            sales.customerReturn(user.id, org.id, branch.id, sale.id, {
              reason: "Test",
              items: [{ saleItemId: concept.id, quantity: 1 }],
            }),
          ).rejects.toThrow("devolución física");
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            sale.id,
            "Test cancel",
          );
          expect(
            (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
              .quantity,
          ).toBe(10);
          expect(
            await tx.inventoryMovement.count({
              where: { referenceId: sale.id },
            }),
          ).toBe(2);
          const onlyConcept = await sales.complete(user.id, org.id, branch.id, {
            items: [
              {
                description: "Solo concepto",
                quantity: 1,
                unitPriceMinor: 200,
              },
            ],
            payments: [{ method: "TRANSFER", amountMinor: 200 }],
          });
          expect(
            await tx.inventoryMovement.count({
              where: { referenceId: onlyConcept.id },
            }),
          ).toBe(0);
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            onlyConcept.id,
            "Test cancel",
          );
          const customer = await tx.customer.create({
            data: {
              organizationId: org.id,
              name: "Credit fixture",
              creditEnabled: true,
              creditLimitMinor: 10000n,
            },
          });
          await tx.userBranch.create({
            data: { userId: user.id, branchId: branch.id },
          });
          const salesBeforeLimitCheck = await tx.sale.count({
            where: { organizationId: org.id },
          });
          await expect(
            sales.complete(user.id, org.id, branch.id, {
              customerId: customer.id,
              items: [
                {
                  description: "Supera el límite",
                  quantity: 1,
                  unitPriceMinor: 10001,
                },
              ],
              payments: [{ method: "ACCOUNT", amountMinor: 10001 }],
            }),
          ).rejects.toThrow(
            "El importe a cuenta corriente supera el crédito disponible del cliente. Reducí ese importe o utilizá otro medio de pago.",
          );
          expect(
            await tx.sale.count({ where: { organizationId: org.id } }),
          ).toBe(salesBeforeLimitCheck);
          const financed = await sales.complete(user.id, org.id, branch.id, {
            customerId: customer.id,
            items: [
              {
                description: "Concepto a cuenta",
                quantity: 1,
                unitPriceMinor: 400,
              },
            ],
            payments: [{ method: "ACCOUNT", amountMinor: 400 }],
          });
          const accounts = new AccountsService(
            scoped,
            new AuditService(scoped),
          );
          const balance = await accounts.itemBalances(
            tx,
            user.id,
            org.id,
            customer.id,
          );
          expect(balance.balanceMinor).toBe("400");
          expect(balance.items[0]).toMatchObject({
            name: "Concepto a cuenta",
            pendingMinor: "400",
            referencePriceMinor: null,
            increaseMinor: "0",
          });
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            financed.id,
            "Test cancel",
          );
          expect(
            (await accounts.itemBalances(tx, user.id, org.id, customer.id))
              .balanceMinor,
          ).toBe("0");
          const secondLot = await tx.productLot.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              productId: product.id,
              number: "SECOND",
              quantity: 2,
              unitCostMinor: 50n,
            },
          });
          const discounted = await sales.complete(user.id, org.id, branch.id, {
            items: [
              {
                productId: product.id,
                quantity: 11,
                expectedUnitPriceMinor: "100",
                requestedUnitPriceMinor: 75,
                discountMinor: 25,
              },
            ],
            payments: [{ method: "TRANSFER", amountMinor: 800 }],
          });
          expect(discounted.totalMinor).toBe("800");
          expect(discounted.items).toHaveLength(2);
          expect(
            discounted.items.every(
              (item) => String(item.unitPriceMinor) === "75",
            ),
          ).toBe(true);
          expect(
            (
              await tx.productPrice.findUniqueOrThrow({
                where: {
                  productId_priceListId: {
                    productId: product.id,
                    priceListId: list.id,
                  },
                },
              })
            ).amountMinor,
          ).toBe(100n);
          const discountedTicket = await sales.ticket(
            user.id,
            org.id,
            branch.id,
            discounted.id,
          );
          expect(discountedTicket.items).toEqual([
            expect.objectContaining({
              quantity: 11,
              unitPriceMinor: "75",
              amountMinor: "825",
            }),
          ]);
          const audit = await tx.auditLog.findFirstOrThrow({
            where: { entityId: discounted.id, action: "COMPLETED" },
          });
          expect(audit.after).toMatchObject({
            priceOverrides: [
              {
                productId: product.id,
                originalUnitPriceMinor: "100",
                unitPriceMinor: "75",
                quantity: 11,
                reason: "Descuento especial por producto",
              },
            ],
          });
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            discounted.id,
            "Test discounted cancel",
          );
          expect(
            (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
              .quantity,
          ).toBe(10);
          expect(
            (
              await tx.productLot.findUniqueOrThrow({
                where: { id: secondLot.id },
              })
            ).quantity,
          ).toBe(2);
          throw rollback;
        },
        { timeout: 25000 },
      ),
    ).rejects.toBe(rollback);
  });
});
