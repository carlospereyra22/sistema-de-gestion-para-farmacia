import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { PriceListUpdates } from "../src/catalog/price-list-updates";
import { SalesService } from "../src/sales/sales.service";
import { AuditService } from "../src/audit/audit.service";

describe("Price lists lifecycle (rollback-only local fixtures)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const host = new URL(process.env.DATABASE_URL!).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host))
      throw new Error("Local database required");
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await moduleRef?.close();
  });
  it("creates both types, saves once, resolves fallback and charges the selected list", async () => {
    const rollback = new Error("ROLLBACK_PRICE_LIST_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Price list test" },
          });
          const other = await tx.organization.create({
            data: { name: "Other test org" },
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
              code: { in: ["CATALOG_MANAGE", "CATALOG_READ", "SALE_MANAGE"] },
            },
          });
          expect(permissions).toHaveLength(3);
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
          const general = await tx.priceList.create({
            data: { organizationId: org.id, name: "Precio general" },
          });
          const foreign = await tx.priceList.create({
            data: { organizationId: other.id, name: "Foreign" },
          });
          const p = await tx.product.create({
            data: {
              organizationId: org.id,
              name: "First",
              prices: {
                create: { priceListId: general.id, amountMinor: 1000n },
              },
            },
          });
          const q = await tx.product.create({
            data: {
              organizationId: org.id,
              name: "Second",
              prices: {
                create: { priceListId: general.id, amountMinor: 2000n },
              },
            },
          });
          for (const product of [p, q])
            await tx.productLot.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                productId: product.id,
                number: "TEST",
                quantity: 10,
                unitCostMinor: 500n,
              },
            });
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
          const catalog = new CatalogService(scoped);
          const prices = new PriceListUpdates(scoped, catalog);
          const sales = new SalesService(scoped, new AuditService(scoped));
          const custom = await catalog.createPriceList(
            user.id,
            org.id,
            "Selected",
          );
          expect(
            await tx.productPrice.count({ where: { priceListId: custom.id } }),
          ).toBe(0);
          const complete = await catalog.createPriceList(
            user.id,
            org.id,
            "Complete",
            true,
          );
          expect(
            await tx.productPrice.count({
              where: { priceListId: complete.id },
            }),
          ).toBe(2);
          const update = {
            requestId: randomUUID(),
            changes: [
              { productId: p.id, expectedMinor: null, amountMinor: "750" },
            ],
          };
          await expect(
            prices.save(user.id, org.id, custom.id, update),
          ).resolves.toMatchObject({ repeated: false });
          await expect(
            prices.save(user.id, org.id, custom.id, update),
          ).resolves.toMatchObject({ repeated: true });
          expect(
            await tx.auditLog.count({
              where: { entityId: custom.id, action: "PRICE_LIST_UPDATED" },
            }),
          ).toBe(1);
          await expect(
            prices.save(user.id, org.id, custom.id, {
              ...update,
              requestId: randomUUID(),
            }),
          ).rejects.toThrow("cambiaron");
          await expect(
            prices.save(user.id, org.id, general.id, update),
          ).rejects.toThrow("solo lectura");
          await expect(
            prices.effective(user.id, org.id, undefined, foreign.id),
          ).rejects.toThrow("no disponible");
          const effective = await prices.effective(
            user.id,
            org.id,
            undefined,
            custom.id,
          );
          expect(
            effective.prices.find((row) => row.productId === p.id)?.amountMinor,
          ).toBe("750");
          expect(
            effective.prices.find((row) => row.productId === q.id)?.amountMinor,
          ).toBe("2000");
          const input = {
            priceListId: custom.id,
            items: [
              { productId: p.id, quantity: 1, expectedUnitPriceMinor: "750" },
              { productId: q.id, quantity: 1, expectedUnitPriceMinor: "2000" },
            ],
            payments: [{ method: "TRANSFER" as const, amountMinor: 2750 }],
          };
          await expect(
            sales.complete(user.id, org.id, branch.id, {
              ...input,
              priceListId: foreign.id,
            }),
          ).rejects.toThrow("no disponible");
          await expect(
            sales.complete(user.id, org.id, branch.id, {
              ...input,
              items: [
                {
                  productId: p.id,
                  quantity: 1,
                  expectedUnitPriceMinor: "1000",
                },
              ],
            }),
          ).rejects.toThrow("precio cambió");
          const sale = await sales.complete(user.id, org.id, branch.id, input);
          expect(sale.totalMinor).toBe("2750");
          expect(sale.items.map((item) => item.unitPriceMinor).sort()).toEqual([
            "2000",
            "750",
          ]);
          const customer = await tx.customer.create({
            data: {
              organizationId: org.id,
              name: "List customer",
              priceListId: custom.id,
            },
          });
          expect(
            (await prices.effective(user.id, org.id, customer.id)).listName,
          ).toBe("Selected");
          await prices.save(user.id, org.id, custom.id, {
            requestId: randomUUID(),
            changes: [
              { productId: p.id, expectedMinor: "750", amountMinor: "800" },
            ],
          });
          const historical = await tx.saleItem.findMany({
            where: { saleId: sale.id, productId: p.id },
          });
          expect(historical[0]?.unitPriceMinor).toBe(750n);
          await expect(
            catalog.renamePriceList(
              user.id,
              org.id,
              custom.id,
              "Selected",
              custom.id,
            ),
          ).rejects.toThrow("otra lista");
          await expect(
            catalog.renamePriceList(
              user.id,
              org.id,
              custom.id,
              "Selected",
              foreign.id,
            ),
          ).rejects.toThrow("organización");
          await expect(
            catalog.renamePriceList(
              user.id,
              org.id,
              general.id,
              "Renamed",
              complete.id,
            ),
          ).rejects.toThrow("protegido");
          await catalog.renamePriceList(
            user.id,
            org.id,
            custom.id,
            "Selected",
            complete.id,
          );
          await tx.productPrice.update({
            where: {
              productId_priceListId: {
                productId: q.id,
                priceListId: complete.id,
              },
            },
            data: { amountMinor: 1500n },
          });
          const resolved = await prices.effective(user.id, org.id, customer.id);
          expect(
            resolved.prices.find((row) => row.productId === p.id),
          ).toMatchObject({ amountMinor: "800", source: "Selected" });
          expect(
            resolved.prices.find((row) => row.productId === q.id),
          ).toMatchObject({ amountMinor: "1500", source: "Complete" });
          await expect(
            sales.complete(user.id, org.id, branch.id, {
              ...input,
              items: [
                {
                  productId: q.id,
                  quantity: 1,
                  expectedUnitPriceMinor: "2000",
                },
              ],
            }),
          ).rejects.toThrow("precio cambió");
          const backedSale = await sales.complete(user.id, org.id, branch.id, {
            customerId: customer.id,
            items: [
              { productId: q.id, quantity: 1, expectedUnitPriceMinor: "1500" },
            ],
            payments: [{ method: "TRANSFER", amountMinor: 1500 }],
          });
          expect(backedSale.totalMinor).toBe("1500");
          await tx.productPrice.update({
            where: {
              productId_priceListId: {
                productId: q.id,
                priceListId: complete.id,
              },
            },
            data: { amountMinor: 0n },
          });
          expect(
            (
              await prices.effective(user.id, org.id, undefined, custom.id)
            ).prices.find((row) => row.productId === q.id)?.amountMinor,
          ).toBe("0");
          await tx.productPrice.delete({
            where: {
              productId_priceListId: {
                productId: q.id,
                priceListId: complete.id,
              },
            },
          });
          // A fallback's own association must not add a fourth priority level.
          const tertiary = await catalog.createPriceList(
            user.id,
            org.id,
            "Not followed",
            true,
          );
          await tx.productPrice.update({
            where: {
              productId_priceListId: {
                productId: q.id,
                priceListId: tertiary.id,
              },
            },
            data: { amountMinor: 900n },
          });
          await catalog.renamePriceList(
            user.id,
            org.id,
            complete.id,
            "Complete",
            tertiary.id,
          );
          expect(
            (
              await prices.effective(user.id, org.id, undefined, custom.id)
            ).prices.find((row) => row.productId === q.id)?.amountMinor,
          ).toBe("2000");
          const generalSale = await sales.complete(user.id, org.id, branch.id, {
            priceListId: custom.id,
            items: [
              { productId: q.id, quantity: 1, expectedUnitPriceMinor: "2000" },
            ],
            payments: [{ method: "TRANSFER", amountMinor: 2000 }],
          });
          expect(generalSale.totalMinor).toBe("2000");
          await catalog.renamePriceList(
            user.id,
            org.id,
            custom.id,
            "Selected",
            null,
          );
          expect(
            (await tx.priceList.findUniqueOrThrow({ where: { id: custom.id } }))
              .fallbackPriceListId,
          ).toBeNull();
          expect(
            (
              await tx.saleItem.findFirstOrThrow({
                where: { saleId: backedSale.id },
              })
            ).unitPriceMinor,
          ).toBe(1500n);
          throw rollback;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(rollback);
  });
});
