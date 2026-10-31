import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { SalesService } from "../src/sales/sales.service";
import { CashService } from "../src/cash/cash.service";
import { accountDueDate, accountToday } from "../src/accounts/account-due-date";

describe("Current account lifecycle (rolled-back fixtures)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await moduleRef.close();
  });
  it("configures credit, finances a sale, collects once into cash, and compensates cancellation", async () => {
    const rollback = new Error("ROLLBACK_TEST_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Account lifecycle test" },
          });
          const branch = await tx.branch.create({
            data: { organizationId: org.id, name: "Test", code: "TEST" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "test-only",
            },
          });
          const permissions = await tx.permission.findMany({
            where: {
              code: {
                in: [
                  "ACCOUNT_READ",
                  "ACCOUNT_MANAGE",
                  "SALE_MANAGE",
                  "CASH_READ",
                  "CASH_MANAGE",
                ],
              },
            },
          });
          expect(permissions).toHaveLength(5);
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Test",
              code: "TEST",
              permissions: {
                create: permissions.map((permission) => ({
                  permissionId: permission.id,
                })),
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
          const customer = await tx.customer.create({
            data: { organizationId: org.id, name: "Test customer" },
          });
          const product = await tx.product.create({
            data: { organizationId: org.id, name: "Test product" },
          });
          const list = await tx.priceList.create({
            data: { organizationId: org.id, name: "Precio general" },
          });
          await tx.productPrice.create({
            data: {
              productId: product.id,
              priceListId: list.id,
              amountMinor: 10000n,
            },
          });
          const lot = await tx.productLot.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              productId: product.id,
              number: "TEST",
              quantity: 10,
              unitCostMinor: 5000n,
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
          // Keep the real services and SQL inside a single rollback-only test transaction.
          const scoped = new Proxy(tx, {
            get(target, property) {
              return property === "$transaction"
                ? (
                    callback: (
                      transaction: Prisma.TransactionClient,
                    ) => Promise<unknown>,
                  ) => callback(tx)
                : Reflect.get(target, property);
            },
          }) as unknown as PrismaService;
          const audit = new AuditService(scoped);
          const accounts = new AccountsService(scoped, audit);
          const sales = new SalesService(scoped, audit);
          await expect(accounts.list(randomUUID(), org.id)).rejects.toThrow();
          const configuration = await accounts.configure(
            user.id,
            org.id,
            customer.id,
            true,
            15000,
          );
          expect(JSON.stringify(configuration)).toContain("15000");
          const input = {
            customerId: customer.id,
            items: [{ productId: product.id, quantity: 1 }],
            payments: [{ method: "ACCOUNT" as const, amountMinor: 10000 }],
          };
          await tx.productLot.update({
            where: { id: lot.id },
            data: { expiresAt: new Date("2000-01-01") },
          });
          await expect(
            sales.complete(user.id, org.id, branch.id, input),
          ).rejects.toThrow("unidades vencidas");
          expect(
            (await tx.productLot.findUnique({ where: { id: lot.id } }))
              ?.quantity,
          ).toBe(10);
          expect(
            await tx.sale.count({ where: { organizationId: org.id } }),
          ).toBe(0);
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "0",
          );
          await tx.productLot.update({
            where: { id: lot.id },
            data: { expiresAt: null },
          });
          const sale = await sales.complete(user.id, org.id, branch.id, input);
          const debit = await tx.customerAccountMovement.findFirstOrThrow({
            where: { saleId: sale.id, type: "DEBIT" },
          });
          await expect(
            accounts.saleDetail(user.id, org.id, customer.id, debit.id),
          ).rejects.toThrow("sucursal");
          await tx.userBranch.create({
            data: { userId: user.id, branchId: branch.id },
          });
          const detail = await accounts.saleDetail(
            user.id,
            org.id,
            customer.id,
            debit.id,
          );
          expect(detail).toMatchObject({
            id: sale.id,
            totalMinor: "10000",
            accountAmountMinor: "10000",
            items: [
              expect.objectContaining({
                name: "Test product",
                quantity: 1,
                unitPriceMinor: "10000",
                discountMinor: "0",
                subtotalMinor: "10000",
              }),
            ],
          });
          expect(() => JSON.stringify(detail)).not.toThrow();
          await expect(
            accounts.saleDetail(user.id, org.id, randomUUID(), debit.id),
          ).rejects.toThrow("compra vinculada");
          await expect(
            accounts.saleDetail(randomUUID(), org.id, customer.id, debit.id),
          ).rejects.toThrow();
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "10000",
          );
          await expect(
            sales.complete(user.id, org.id, branch.id, input),
          ).rejects.toThrow("supera el crédito disponible del cliente");
          await accounts.configure(user.id, org.id, customer.id, true, null);
          expect(
            (await accounts.list(user.id, org.id))[0]?.creditLimitMinor,
          ).toBeNull();
          const unlimitedSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            input,
          );
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "20000",
          );
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            unlimitedSale.id,
            "Test unlimited credit",
          );
          await accounts.configure(user.id, org.id, customer.id, false, null);
          await expect(
            sales.complete(user.id, org.id, branch.id, input),
          ).rejects.toThrow("cuenta corriente habilitada");
          await accounts.configure(user.id, org.id, customer.id, true, 0);
          await expect(
            sales.complete(user.id, org.id, branch.id, input),
          ).rejects.toThrow("supera el crédito disponible del cliente");
          await accounts.configure(user.id, org.id, customer.id, true, 15000);
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              customer.id,
              11000,
              "TRANSFER",
            ),
          ).rejects.toThrow();
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              customer.id,
              100,
              "CASH",
              undefined,
              randomUUID(),
            ),
          ).rejects.toThrow();
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              customer.id,
              100,
              "ACCOUNT",
            ),
          ).rejects.toThrow();
          await accounts.configure(user.id, org.id, customer.id, false, 15000);
          const operation = randomUUID();
          const firstReceipt = await accounts.pay(
            user.id,
            org.id,
            branch.id,
            customer.id,
            4000,
            "CASH",
            "Test receipt",
            session.id,
            operation,
          );
          const firstTicket = await accounts.receipt(
            user.id,
            org.id,
            customer.id,
            firstReceipt.id,
          );
          expect(firstTicket).toMatchObject({
            amountMinor: "4000",
            balanceAfterMinor: "6000",
            method: "CASH",
          });
          await expect(
            accounts.receipt(user.id, org.id, randomUUID(), firstReceipt.id),
          ).rejects.toThrow();
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            customer.id,
            4000,
            "CASH",
            "Test receipt",
            session.id,
            operation,
          );
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "6000",
          );
          expect(
            await tx.cashMovement.count({
              where: { cashSessionId: session.id },
            }),
          ).toBe(1);
          expect(
            (
              await tx.cashMovement.findFirst({
                where: { cashSessionId: session.id },
              })
            )?.amountMinor,
          ).toBe(4000n);
          const pendingBeforeAssignment = await accounts.items(
            user.id,
            org.id,
            customer.id,
          );
          expect(pendingBeforeAssignment.unassignedReceipts).toHaveLength(1);
          const saleItemId = sale.items[0]!.id;
          await accounts.assignItems(
            user.id,
            org.id,
            customer.id,
            pendingBeforeAssignment.unassignedReceipts[0]!.id,
            [{ saleItemId, amountMinor: 4000 }],
          );
          expect(
            (await accounts.items(user.id, org.id, customer.id)).items.find(
              (item) => item.saleItemId === saleItemId,
            ),
          ).toMatchObject({ paidMinor: "4000", pendingMinor: "6000" });
          await tx.product.update({
            where: { id: product.id },
            data: {
              externalReferenceSource: "official",
              externalReferencePriceMinor: 12000n,
              externalReferenceCheckedAt: new Date(),
            },
          });
          const preview = await accounts.previewPrices(
            user.id,
            org.id,
            customer.id,
            sale.id,
          );
          expect(preview).toMatchObject({
            increaseMinor: "1200",
            pendingMinor: "6000",
            nextPendingMinor: "7200",
          });
          const priceOperation = randomUUID();
          await accounts.updatePrices(
            user.id,
            org.id,
            customer.id,
            sale.id,
            preview.fingerprint,
            priceOperation,
          );
          await accounts.updatePrices(
            user.id,
            org.id,
            customer.id,
            sale.id,
            preview.fingerprint,
            priceOperation,
          );
          expect(
            (
              await accounts.previewPrices(
                user.id,
                org.id,
                customer.id,
                sale.id,
              )
            ).increaseMinor,
          ).toBe("0");
          expect(
            (await accounts.items(user.id, org.id, customer.id)).items.find(
              (item) => item.saleItemId === saleItemId,
            ),
          ).toMatchObject({ paidMinor: "4000", pendingMinor: "7200" });
          expect(
            (await tx.saleItem.findUnique({ where: { id: saleItemId } }))
              ?.unitPriceMinor,
          ).toBe(10000n);
          await tx.product.update({
            where: { id: product.id },
            data: { externalReferencePriceMinor: 15000n },
          });
          const nextPreview = await accounts.previewPrices(
            user.id,
            org.id,
            customer.id,
            sale.id,
          );
          expect(nextPreview.increaseMinor).toBe("1800");
          await tx.product.update({
            where: { id: product.id },
            data: { externalReferencePriceMinor: 16000n },
          });
          await expect(
            accounts.updatePrices(
              user.id,
              org.id,
              customer.id,
              sale.id,
              nextPreview.fingerprint,
              randomUUID(),
            ),
          ).rejects.toThrow("Cambió");
          expect(
            await tx.cashMovement.count({
              where: { cashSessionId: session.id },
            }),
          ).toBe(1);
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "7200",
          );
          const transferReceipt = await accounts.pay(
            user.id,
            org.id,
            branch.id,
            customer.id,
            3000,
            "TRANSFER",
            "Test transfer",
            undefined,
            randomUUID(),
            [{ saleItemId, amountMinor: 3000 }],
          );
          const transferTicket = await accounts.receipt(
            user.id,
            org.id,
            customer.id,
            transferReceipt.id,
          );
          expect(transferTicket).toMatchObject({
            amountMinor: "3000",
            balanceAfterMinor: "4200",
            items: [{ saleId: sale.id, amountMinor: "3000" }],
          });
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            customer.id,
            4200,
            "CARD",
            "Test card",
            undefined,
            randomUUID(),
            [{ saleItemId, amountMinor: 4200 }],
          );
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "0",
          );
          expect(
            await accounts.receipt(
              user.id,
              org.id,
              customer.id,
              firstReceipt.id,
            ),
          ).toEqual(firstTicket);
          expect(
            await accounts.receipt(
              user.id,
              org.id,
              customer.id,
              transferReceipt.id,
            ),
          ).toEqual(transferTicket);
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            sale.id,
            "Test cancellation",
          );
          expect((await accounts.list(user.id, org.id))[0]?.balanceMinor).toBe(
            "-11200",
          );
          expect(
            (await tx.productLot.findUnique({ where: { id: lot.id } }))
              ?.quantity,
          ).toBe(10);
          const batchCustomer = await tx.customer.create({
            data: {
              organizationId: org.id,
              name: "Batch update test",
              creditEnabled: true,
              creditLimitMinor: null,
            },
          });
          const firstBatchSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            { ...input, customerId: batchCustomer.id },
          );
          const secondBatchSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            { ...input, customerId: batchCustomer.id },
          );
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            batchCustomer.id,
            1000,
            "TRANSFER",
            "Partial batch receipt",
            undefined,
            randomUUID(),
            [{ saleItemId: firstBatchSale.items[0]!.id, amountMinor: 1000 }],
          );
          const batchPreview = await accounts.previewPrices(
            user.id,
            org.id,
            batchCustomer.id,
            "all",
          );
          expect(batchPreview).toMatchObject({
            pendingMinor: "19000",
            increaseMinor: "11400",
            nextPendingMinor: "30400",
          });
          expect(
            new Set(batchPreview.items.map((item) => item.saleId)).size,
          ).toBe(2);
          const batchOperation = randomUUID();
          await accounts.updatePrices(
            user.id,
            org.id,
            batchCustomer.id,
            "all",
            batchPreview.fingerprint,
            batchOperation,
          );
          await accounts.updatePrices(
            user.id,
            org.id,
            batchCustomer.id,
            "all",
            batchPreview.fingerprint,
            batchOperation,
          );
          expect(
            (await accounts.items(user.id, org.id, batchCustomer.id))
              .balanceMinor,
          ).toBe("30400");
          expect(
            (
              await accounts.previewPrices(
                user.id,
                org.id,
                batchCustomer.id,
                "all",
              )
            ).increaseMinor,
          ).toBe("0");
          expect(
            await tx.customerAccountMovement.count({
              where: { customerId: batchCustomer.id, type: "DEBIT" },
            }),
          ).toBe(4);
          await expect(
            accounts.updatePrices(
              user.id,
              org.id,
              batchCustomer.id,
              "all",
              batchPreview.fingerprint,
              randomUUID(),
            ),
          ).rejects.toThrow("Cambió");
          await expect(
            accounts.updatePrices(
              user.id,
              org.id,
              batchCustomer.id,
              secondBatchSale.id,
              batchPreview.fingerprint,
              batchOperation,
            ),
          ).rejects.toThrow();
          const mixedBefore = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          const mixedLine = mixedBefore.items.find(
            (item) => BigInt(item.pendingMinor) >= 2000n,
          )!;
          const mixedAllocations = [
            { saleItemId: mixedLine.saleItemId, amountMinor: 2000 },
          ];
          const mixedParts = [
            { method: "CASH" as const, amountMinor: 1000 },
            { method: "CARD" as const, amountMinor: 1000 },
          ];
          const mixedKey = randomUUID();
          const cashBefore = await tx.cashMovement.aggregate({
            where: { cashSessionId: session.id },
            _sum: { amountMinor: true },
          });
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              batchCustomer.id,
              2000,
              "OTHER",
              "Mixto",
              randomUUID(),
              mixedKey,
              mixedAllocations,
              mixedParts,
            ),
          ).rejects.toThrow("caja abierta");
          const mixedReceipt = await accounts.pay(
            user.id,
            org.id,
            branch.id,
            batchCustomer.id,
            2000,
            "OTHER",
            "Mixto",
            session.id,
            mixedKey,
            mixedAllocations,
            mixedParts,
          );
          expect(
            await accounts.pay(
              user.id,
              org.id,
              branch.id,
              batchCustomer.id,
              2000,
              "OTHER",
              "Mixto",
              session.id,
              mixedKey,
              mixedAllocations,
              [...mixedParts].reverse(),
            ),
          ).toEqual(mixedReceipt);
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              batchCustomer.id,
              2000,
              "OTHER",
              "Mixto",
              session.id,
              mixedKey,
              mixedAllocations,
              [
                { method: "CASH", amountMinor: 500 },
                { method: "CARD", amountMinor: 1500 },
              ],
            ),
          ).rejects.toThrow("identificador");
          const cashAfter = await tx.cashMovement.aggregate({
            where: { cashSessionId: session.id },
            _sum: { amountMinor: true },
          });
          expect(
            cashAfter._sum.amountMinor! - cashBefore._sum.amountMinor!,
          ).toBe(1000n);
          const mixedAfter = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          expect(BigInt(mixedAfter.balanceMinor)).toBe(
            BigInt(mixedBefore.balanceMinor) - 2000n,
          );
          expect(mixedAfter.unassignedReceipts).toHaveLength(0);
          expect(
            mixedAfter.items.find(
              (item) => item.saleItemId === mixedLine.saleItemId,
            )?.paidMinor,
          ).toBe(String(BigInt(mixedLine.paidMinor) + 2000n));
          const printedMixed = await accounts.receipt(
            user.id,
            org.id,
            batchCustomer.id,
            mixedReceipt.id,
          );
          expect(printedMixed).toMatchObject({
            amountMinor: "2000",
            method: "MIXED",
            payments: [
              { method: "CARD", amountMinor: "1000" },
              { method: "CASH", amountMinor: "1000" },
            ],
          });
          const totalBefore = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          const totalInput = {
            expectedPendingMinor: Number(totalBefore.balanceMinor),
            nextPendingMinor: Number(totalBefore.balanceMinor) + 1234,
            expectedItems: totalBefore.items
              .filter((item) => BigInt(item.pendingMinor) > 0n)
              .map((item) => ({
                saleItemId: item.saleItemId,
                pendingMinor: item.pendingMinor,
              })),
            reason: "Aumento total de prueba",
            clientOperationId: randomUUID(),
          };
          await expect(
            accounts.increaseTotalDebt(
              randomUUID(),
              org.id,
              batchCustomer.id,
              totalInput,
            ),
          ).rejects.toThrow();
          await expect(
            accounts.increaseTotalDebt(
              user.id,
              org.id,
              customer.id,
              totalInput,
            ),
          ).rejects.toThrow();
          const totalResult = await accounts.increaseTotalDebt(
            user.id,
            org.id,
            batchCustomer.id,
            totalInput,
          );
          expect(
            await accounts.increaseTotalDebt(
              user.id,
              org.id,
              batchCustomer.id,
              totalInput,
            ),
          ).toEqual(totalResult);
          await expect(
            accounts.increaseTotalDebt(user.id, org.id, batchCustomer.id, {
              ...totalInput,
              nextPendingMinor: totalInput.nextPendingMinor + 1,
            }),
          ).rejects.toThrow("Identificador");
          await expect(
            accounts.increaseTotalDebt(user.id, org.id, batchCustomer.id, {
              ...totalInput,
              clientOperationId: randomUUID(),
            }),
          ).rejects.toThrow("Cambió");
          const totalAfter = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          expect(totalAfter.balanceMinor).toBe(
            String(totalInput.nextPendingMinor),
          );
          expect(
            totalAfter.items.reduce(
              (sum, item) => sum + BigInt(item.pendingMinor),
              0n,
            ),
          ).toBe(BigInt(totalInput.nextPendingMinor));
          for (const item of totalBefore.items) {
            const after = totalAfter.items.find(
              (row) => row.saleItemId === item.saleItemId,
            )!;
            expect(after.paidMinor).toBe(item.paidMinor);
            expect(after.previousPriceMinor).toBe(item.previousPriceMinor);
          }
          const manualBefore = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          const manualItem = manualBefore.items[0]!;
          const originalSale = await tx.sale.findUniqueOrThrow({
            where: { id: manualItem.saleId },
          });
          const manualInput = {
            expectedPendingMinor: Number(manualItem.pendingMinor),
            nextPendingMinor: Number(manualItem.pendingMinor) + 2000,
            reason: "Actualización manual acordada",
            clientOperationId: randomUUID(),
          };
          await expect(
            accounts.increaseDebt(
              randomUUID(),
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              manualInput,
            ),
          ).rejects.toThrow();
          await expect(
            accounts.increaseDebt(
              user.id,
              org.id,
              customer.id,
              manualItem.saleItemId,
              manualInput,
            ),
          ).rejects.toThrow();
          await expect(
            accounts.increaseDebt(
              user.id,
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              { ...manualInput, reason: " " },
            ),
          ).rejects.toThrow();
          await expect(
            accounts.increaseDebt(
              user.id,
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              {
                ...manualInput,
                nextPendingMinor: manualInput.expectedPendingMinor,
              },
            ),
          ).rejects.toThrow();
          await expect(
            accounts.increaseDebt(
              user.id,
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              {
                ...manualInput,
                expectedPendingMinor: manualInput.expectedPendingMinor - 1,
              },
            ),
          ).rejects.toThrow("Cambió");
          const manualResult = await accounts.increaseDebt(
            user.id,
            org.id,
            batchCustomer.id,
            manualItem.saleItemId,
            manualInput,
          );
          expect(
            await accounts.increaseDebt(
              user.id,
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              manualInput,
            ),
          ).toEqual(manualResult);
          await expect(
            accounts.increaseDebt(
              user.id,
              org.id,
              batchCustomer.id,
              manualItem.saleItemId,
              { ...manualInput, reason: "Otro motivo" },
            ),
          ).rejects.toThrow("Identificador");
          const manualAfter = await accounts.items(
            user.id,
            org.id,
            batchCustomer.id,
          );
          expect(manualAfter.balanceMinor).toBe(
            String(BigInt(manualBefore.balanceMinor) + 2000n),
          );
          const adjusted = manualAfter.items.find(
            (item) => item.saleItemId === manualItem.saleItemId,
          )!;
          expect(adjusted.pendingMinor).toBe(
            String(manualInput.nextPendingMinor),
          );
          expect(adjusted.paidMinor).toBe(manualItem.paidMinor);
          expect(adjusted.previousPriceMinor).toBe(
            manualItem.previousPriceMinor,
          );
          expect(
            (
              await tx.sale.findUniqueOrThrow({
                where: { id: manualItem.saleId },
              })
            ).totalMinor,
          ).toBe(originalSale.totalMinor);
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            batchCustomer.id,
            1000,
            "TRANSFER",
            "Entrega tras ajuste",
            undefined,
            randomUUID(),
            [{ saleItemId: manualItem.saleItemId, amountMinor: 1000 }],
          );
          const partial = (
            await accounts.items(user.id, org.id, batchCustomer.id)
          ).items.find((item) => item.saleItemId === manualItem.saleItemId)!;
          expect(partial.pendingMinor).toBe(
            String(manualInput.nextPendingMinor - 1000),
          );
          expect(partial.paidMinor).toBe(
            String(BigInt(manualItem.paidMinor) + 1000n),
          );
          const secondInput = {
            ...manualInput,
            expectedPendingMinor: Number(partial.pendingMinor),
            nextPendingMinor: Number(partial.pendingMinor) + 500,
            clientOperationId: randomUUID(),
          };
          await accounts.increaseDebt(
            user.id,
            org.id,
            batchCustomer.id,
            manualItem.saleItemId,
            secondInput,
          );
          expect(
            (
              await accounts.items(user.id, org.id, batchCustomer.id)
            ).items.find((item) => item.saleItemId === manualItem.saleItemId)
              ?.paidMinor,
          ).toBe(partial.paidMinor);
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            manualItem.saleId,
            "Anulación con ajuste manual",
          );
          const compensating =
            await tx.customerAccountMovement.findFirstOrThrow({
              where: { saleId: manualItem.saleId, type: "CREDIT" },
            });
          const allDebits = await tx.customerAccountMovement.aggregate({
            where: { saleId: manualItem.saleId, type: "DEBIT" },
            _sum: { amountMinor: true },
          });
          expect(compensating.amountMinor).toBe(allDebits._sum.amountMinor);
          expect(
            await tx.customerAccountMovement.findUnique({
              where: { id: manualResult.id },
            }),
          ).not.toBeNull();
          const termCustomer = await tx.customer.create({
            data: { organizationId: org.id, name: "Plazo de prueba" },
          });
          await expect(
            accounts.configure(
              user.id,
              org.id,
              termCustomer.id,
              true,
              null,
              -1,
            ),
          ).rejects.toThrow("plazo");
          await accounts.configure(
            user.id,
            org.id,
            termCustomer.id,
            true,
            null,
            30,
          );
          // Old clients that omit the term must not reset an already configured term.
          await accounts.configure(
            user.id,
            org.id,
            termCustomer.id,
            true,
            null,
          );
          expect(
            (
              await tx.customer.findUniqueOrThrow({
                where: { id: termCustomer.id },
              })
            ).accountTermDays,
          ).toBe(30);
          const termInput = {
            ...input,
            customerId: termCustomer.id,
            clientOperationId: randomUUID(),
          };
          const termSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            termInput,
          );
          const storedTermSale = await tx.sale.findUniqueOrThrow({
            where: { id: termSale.id },
            include: { items: true },
          });
          expect(storedTermSale.accountDueDate).toEqual(
            accountDueDate(storedTermSale.completedAt!, 30),
          );
          await accounts.configure(
            user.id,
            org.id,
            termCustomer.id,
            true,
            null,
            7,
          );
          expect(
            (await sales.complete(user.id, org.id, branch.id, termInput)).id,
          ).toBe(termSale.id);
          expect(
            (await tx.sale.findUniqueOrThrow({ where: { id: termSale.id } }))
              .accountDueDate,
          ).toEqual(storedTermSale.accountDueDate);
          const today = accountToday(new Date());
          const yesterday = new Date(
            Date.parse(`${today}T00:00:00Z`) - 86400000,
          );
          // Only synthetic rolled-back fixtures get an artificial old due date.
          await tx.sale.update({
            where: { id: termSale.id },
            data: { accountDueDate: yesterday },
          });
          const dueRow = (
            await accounts.dueDates(user.id, org.id, branch.id)
          ).rows.find((row) => row.saleId === termSale.id)!;
          expect(dueRow.status).toBe("OVERDUE");
          expect(dueRow.daysOverdue).toBe(1);
          expect(dueRow.pendingMinor).toBe("10000");
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            termCustomer.id,
            4000,
            "TRANSFER",
            "Parcial",
            undefined,
            randomUUID(),
            [{ saleItemId: storedTermSale.items[0]!.id, amountMinor: 4000 }],
          );
          const afterPartial = (
            await accounts.dueDates(user.id, org.id, branch.id)
          ).rows.find((row) => row.saleId === termSale.id)!;
          expect(afterPartial.pendingMinor).toBe("6000");
          const dueDetail = await accounts.dueSaleDetail(
            user.id,
            org.id,
            branch.id,
            termSale.id,
          );
          expect(dueDetail.totalMinor).toBe("10000");
          expect(dueDetail.paidMinor).toBe("4000");
          expect(dueDetail.pendingMinor).toBe("6000");
          expect(dueDetail.items[0]?.unitPriceMinor).toBe("10000");
          expect(dueDetail.payments).toHaveLength(1);
          expect(dueDetail.payments[0]?.amountMinor).toBe("4000");
          expect(
            dueDetail.events.some((event) => event.kind === "payment"),
          ).toBe(true);
          await expect(
            accounts.dueSaleDetail(user.id, org.id, randomUUID(), termSale.id),
          ).rejects.toThrow();
          await expect(
            accounts.dueSaleDetail(
              user.id,
              randomUUID(),
              branch.id,
              termSale.id,
            ),
          ).rejects.toThrow();
          await expect(
            accounts.dueSaleDetail(
              randomUUID(),
              org.id,
              branch.id,
              termSale.id,
            ),
          ).rejects.toThrow();
          await expect(
            accounts.dueSaleDetail(user.id, org.id, branch.id, randomUUID()),
          ).rejects.toThrow();
          expect(afterPartial.dueDate).toBe(
            yesterday.toISOString().slice(0, 10),
          );
          // Arrears do not block another sale; the new term applies only to it.
          const nextTermSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            { ...termInput, clientOperationId: randomUUID() },
          );
          const nextStored = await tx.sale.findUniqueOrThrow({
            where: { id: nextTermSale.id },
          });
          expect(nextStored.accountDueDate).toEqual(
            accountDueDate(nextStored.completedAt!, 7),
          );
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            termCustomer.id,
            6000,
            "TRANSFER",
            "Saldo",
            undefined,
            randomUUID(),
            [{ saleItemId: storedTermSale.items[0]!.id, amountMinor: 6000 }],
          );
          const settledDetail = await accounts.dueSaleDetail(
            user.id,
            org.id,
            branch.id,
            termSale.id,
          );
          expect(settledDetail.status).toBe("PAID");
          expect(settledDetail.pendingMinor).toBe("0");
          expect(settledDetail.paidMinor).toBe("10000");
          expect(settledDetail.payments).toHaveLength(2);
          expect(settledDetail.events.some((event) => event.settled)).toBe(
            true,
          );
          expect(
            (await accounts.dueDates(user.id, org.id, branch.id)).rows.some(
              (row) => row.saleId === termSale.id,
            ),
          ).toBe(false);
          await accounts.configure(
            user.id,
            org.id,
            termCustomer.id,
            true,
            null,
            null,
          );
          const undated = await sales.complete(user.id, org.id, branch.id, {
            ...termInput,
            clientOperationId: randomUUID(),
          });
          expect(
            (await accounts.dueDates(user.id, org.id, branch.id)).rows.find(
              (row) => row.saleId === undated.id,
            )?.status,
          ).toBe("UNDATED");
          await tx.customerAccountMovement.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              customerId: termCustomer.id,
              type: "CREDIT",
              amountMinor: 100n,
              actorId: user.id,
              paymentMethod: "TRANSFER",
            },
          });
          const unassigned = (
            await accounts.dueDates(user.id, org.id, branch.id)
          ).rows.find((row) => row.saleId === nextTermSale.id)!;
          expect(unassigned.status).toBe("REVIEW");
          expect(unassigned.pendingMinor).toBeNull();
          expect(unassigned.daysOverdue).toBe(0);
          const incompleteDetail = await accounts.dueSaleDetail(
            user.id,
            org.id,
            branch.id,
            nextTermSale.id,
          );
          expect(incompleteDetail.status).toBe("REVIEW");
          expect(incompleteDetail.pendingMinor).toBeNull();
          expect(
            incompleteDetail.events.some(
              (event) => event.calculated || event.settled,
            ),
          ).toBe(false);
          await expect(
            accounts.dueDates(randomUUID(), org.id, branch.id),
          ).rejects.toThrow();
          await expect(
            accounts.dueDates(user.id, randomUUID(), branch.id),
          ).rejects.toThrow();
          await expect(
            accounts.dueDates(user.id, org.id, randomUUID()),
          ).rejects.toThrow();
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            undated.id,
            "Prueba anulación vencimientos",
          );
          expect(
            (await accounts.dueDates(user.id, org.id, branch.id)).rows.some(
              (row) => row.saleId === undated.id,
            ),
          ).toBe(false);
          // Final settlement preserves original sales and compensates both signs.
          await tx.productLot.update({
            where: { id: lot.id },
            data: { quantity: { increment: 4 } },
          });
          for (const finalAmount of [8000, 12000]) {
            const finalCustomer = await tx.customer.create({
              data: {
                organizationId: org.id,
                name: "Final settlement fixture",
              },
            });
            await accounts.configure(
              user.id,
              org.id,
              finalCustomer.id,
              true,
              null,
            );
            const finalSale = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              customerId: finalCustomer.id,
              clientOperationId: randomUUID(),
            });
            const finalDetail = await accounts.items(
              user.id,
              org.id,
              finalCustomer.id,
            );
            const finalItem = finalDetail.items.find(
              (row) => row.saleId === finalSale.id,
            )!;
            expect(finalItem.pendingMinor).toBe("10000");
            const operationId = randomUUID();
            const allocation = [
              {
                saleItemId: finalItem.saleItemId,
                amountMinor: finalAmount,
                expectedPendingMinor: 10000,
              },
            ];
            const finalReceipt = await accounts.pay(
              user.id,
              org.id,
              branch.id,
              finalCustomer.id,
              finalAmount,
              "TRANSFER",
              undefined,
              undefined,
              operationId,
              allocation,
            );
            expect(
              await accounts.pay(
                user.id,
                org.id,
                branch.id,
                finalCustomer.id,
                finalAmount,
                "TRANSFER",
                undefined,
                undefined,
                operationId,
                allocation,
              ),
            ).toEqual(finalReceipt);
            const afterFinal = await accounts.items(
              user.id,
              org.id,
              finalCustomer.id,
            );
            expect(afterFinal.balanceMinor).toBe("0");
            expect(afterFinal.items[0]).toMatchObject({
              pendingMinor: "0",
              paidMinor: String(finalAmount),
              financedMinor: String(finalAmount),
            });
            expect(
              (await tx.sale.findUniqueOrThrow({ where: { id: finalSale.id } }))
                .totalMinor,
            ).toBe(10000n);
            expect(
              await tx.customerAccountMovement.count({
                where: { customerId: finalCustomer.id },
              }),
            ).toBe(3);
            await sales.cancel(
              user.id,
              org.id,
              branch.id,
              finalSale.id,
              "Cancel final settlement fixture",
            );
            expect(
              (await accounts.items(user.id, org.id, finalCustomer.id))
                .balanceMinor,
            ).toBe(String(-finalAmount));
          }
          const separateCustomer = await tx.customer.create({
            data: { organizationId: org.id, name: "Separate payment fixture" },
          });
          await accounts.configure(
            user.id,
            org.id,
            separateCustomer.id,
            true,
            null,
          );
          const separateSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            {
              ...input,
              customerId: separateCustomer.id,
              clientOperationId: randomUUID(),
            },
          );
          const separateItem = (
            await accounts.items(user.id, org.id, separateCustomer.id)
          ).items.find((item) => item.saleId === separateSale.id)!;
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            separateCustomer.id,
            2000,
            "TRANSFER",
            undefined,
            undefined,
            randomUUID(),
            [{ saleItemId: separateItem.saleItemId, amountMinor: 2000 }],
          );
          expect(
            (await accounts.items(user.id, org.id, separateCustomer.id))
              .items[0]?.pendingMinor,
          ).toBe("8000");
          const partialOperation = randomUUID();
          const separateAllocation = [
            {
              saleItemId: separateItem.saleItemId,
              amountMinor: 3000,
              expectedPendingMinor: 8000,
              nextPendingMinor: 9000,
            },
          ];
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            separateCustomer.id,
            3000,
            "TRANSFER",
            undefined,
            undefined,
            partialOperation,
            separateAllocation,
          );
          await accounts.pay(
            user.id,
            org.id,
            branch.id,
            separateCustomer.id,
            3000,
            "TRANSFER",
            undefined,
            undefined,
            partialOperation,
            separateAllocation,
          );
          const separateResult = await accounts.items(
            user.id,
            org.id,
            separateCustomer.id,
          );
          expect(separateResult.balanceMinor).toBe("6000");
          expect(separateResult.items[0]).toMatchObject({
            financedMinor: "11000",
            paidMinor: "5000",
            pendingMinor: "6000",
          });
          // Pending collections use the real service and SQL, but every fixture is rolled back.
          const cash = new CashService(scoped, audit);
          const pendingReceipt = await accounts.pay(
            user.id,
            org.id,
            branch.id,
            separateCustomer.id,
            1000,
            "CASH",
            "Sin caja",
            undefined,
            randomUUID(),
            [{ saleItemId: separateItem.saleItemId, amountMinor: 1000 }],
          );
          const receiptPending =
            await tx.cashPendingCollection.findUniqueOrThrow({
              where: {
                organizationId_sourceType_sourceId: {
                  organizationId: org.id,
                  sourceType: "RECEIPT",
                  sourceId: pendingReceipt.id,
                },
              },
            });
          expect(receiptPending.cashMinor).toBe(1000n);
          const closedRegister = await tx.cashRegister.create({
            data: { branchId: branch.id, name: "Destino cerrado" },
          });
          await cash.setCollectionDestination(
            user.id,
            org.id,
            branch.id,
            receiptPending.id,
            closedRegister.id,
          );
          await cash.setCollectionDestination(
            user.id,
            org.id,
            branch.id,
            receiptPending.id,
            closedRegister.id,
          );
          expect(
            await tx.cashSession.count({
              where: { cashRegisterId: closedRegister.id },
            }),
          ).toBe(0);
          expect(
            (
              await tx.cashPendingCollection.findUniqueOrThrow({
                where: { id: receiptPending.id },
              })
            ).assignedAt,
          ).toBeNull();
          await expect(
            cash.editRegister(user.id, org.id, branch.id, closedRegister.id, {
              name: "Destino cerrado",
              active: false,
              expectedName: "Destino cerrado",
              expectedActive: true,
            }),
          ).rejects.toThrow("cobros asignados");
          const destination = await tx.cashSession.create({
            data: {
              cashRegisterId: closedRegister.id,
              openedById: user.id,
              openingAmountMinor: 0n,
            },
          });
          await cash.assignCollection(
            user.id,
            org.id,
            branch.id,
            receiptPending.id,
            destination.id,
          );
          await cash.assignCollection(
            user.id,
            org.id,
            branch.id,
            receiptPending.id,
            destination.id,
          );
          expect(
            await tx.cashMovement.count({
              where: { cashSessionId: destination.id },
            }),
          ).toBe(1);
          expect(
            (await accounts.items(user.id, org.id, separateCustomer.id))
              .balanceMinor,
          ).toBe("5000");
          await tx.productLot.update({
            where: { id: lot.id },
            data: { quantity: 100, expiresAt: null },
          });
          const unassignedSale = await sales.complete(
            user.id,
            org.id,
            branch.id,
            {
              ...input,
              clientOperationId: randomUUID(),
              payments: [
                { method: "CASH", amountMinor: 9000 },
                { method: "CARD", amountMinor: 1000 },
                { method: "TRANSFER", amountMinor: 1000 },
              ],
            },
          );
          const salePending = await tx.cashPendingCollection.findUniqueOrThrow({
            where: {
              organizationId_sourceType_sourceId: {
                organizationId: org.id,
                sourceType: "SALE",
                sourceId: unassignedSale.id,
              },
            },
          });
          expect(salePending).toMatchObject({
            cashMinor: 8000n,
            cardMinor: 1000n,
            transferMinor: 1000n,
            changeMinor: 1000n,
            assignedAt: null,
          });
          await cash.assignCollection(
            user.id,
            org.id,
            branch.id,
            salePending.id,
            destination.id,
          );
          await cash.assignCollection(
            user.id,
            org.id,
            branch.id,
            salePending.id,
            destination.id,
          );
          expect(
            await tx.cashMovement.count({
              where: { cashSessionId: destination.id },
            }),
          ).toBe(2);
          await sales.cancel(
            user.id,
            org.id,
            branch.id,
            unassignedSale.id,
            "Anulación de prueba",
          );
          const net = await tx.cashMovement.groupBy({
            by: ["type"],
            where: { cashSessionId: destination.id },
            _sum: { amountMinor: true },
          });
          expect(net.find((item) => item.type === "IN")?._sum.amountMinor).toBe(
            9000n,
          );
          expect(
            net.find((item) => item.type === "OUT")?._sum.amountMinor,
          ).toBe(8000n);
          expect(
            (
              await tx.cashPendingCollection.findUniqueOrThrow({
                where: { id: salePending.id },
              })
            ).voidedAt,
          ).not.toBeNull();
          await expect(
            cash.assignCollection(
              user.id,
              org.id,
              branch.id,
              salePending.id,
              destination.id,
            ),
          ).rejects.toThrow();
          const ruleRegister = await cash.createRegister(
            user.id,
            org.id,
            branch.id,
            "Caja reglas",
            "REGLAS-01",
          );
          const settings = await cash.saveSettings(user.id, org.id, branch.id, {
            version: 0,
            allowWithoutSession: false,
            askOpeningAmount: false,
            requireMovementReason: true,
            allowManualMovements: false,
            defaultRegisterId: ruleRegister.id,
          });
          expect(settings.version).toBe(1);
          await expect(
            sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
              payments: [{ method: "TRANSFER", amountMinor: 10000 }],
            }),
          ).rejects.toThrow("caja abierta");
          await expect(
            accounts.pay(
              user.id,
              org.id,
              branch.id,
              separateCustomer.id,
              100,
              "CARD",
              undefined,
              undefined,
              randomUUID(),
              [{ saleItemId: separateItem.saleItemId, amountMinor: 100 }],
            ),
          ).rejects.toThrow("caja abierta");
          const ruleSession = await cash.open(user.id, org.id, branch.id, {
            cashRegisterId: ruleRegister.id,
            openingAmountMinor: 10000,
          });
          expect(ruleSession.openingAmountMinor).toBe("0");
          await expect(
            cash.movement(user.id, org.id, branch.id, ruleSession.id, {
              type: "IN",
              amountMinor: 100,
              reason: "Fondo",
            }),
          ).rejects.toThrow("deshabilitados");
          await cash.saveSettings(user.id, org.id, branch.id, {
            ...settings,
            allowManualMovements: true,
            requireMovementReason: false,
          });
          await cash.movement(user.id, org.id, branch.id, ruleSession.id, {
            type: "IN",
            amountMinor: 100,
            reason: "",
            clientOperationId: randomUUID(),
          });
          await cash.close(user.id, org.id, branch.id, ruleSession.id, {
            closingAmountMinor: 100,
            expectedAmountMinor: 100,
          });
          const ruleClosure = await cash.closureDetail(
            user.id,
            org.id,
            branch.id,
            ruleSession.id,
          );
          expect(ruleClosure).toMatchObject({
            cashRegisterName: "Caja reglas",
            expectedAmountMinor: "100",
            differenceMinor: "0",
            snapshotAvailable: true,
          });
          await expect(
            cash.editRegister(user.id, org.id, branch.id, ruleRegister.id, {
              name: "Caja reglas",
              active: false,
              expectedName: "Caja reglas",
              expectedActive: true,
            }),
          ).rejects.toThrow("predeterminada");
          throw rollback;
        },
        { timeout: 30000 },
      ),
    ).rejects.toBe(rollback);
  }, 35000);
});
