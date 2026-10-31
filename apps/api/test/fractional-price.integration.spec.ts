import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CatalogService } from "../src/catalog/catalog.service";

describe("Fractional prices, rollback-only local fixtures", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    if (
      !["localhost", "127.0.0.1", "::1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Local database required");
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await moduleRef?.close();
  });
  it("persists linked/manual rules, recalculates without compounding and rolls back invalid edits", async () => {
    const rollback = new Error("ROLLBACK_FRACTION_FIXTURES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: { name: "Fraction test" },
          });
          const user = await tx.user.create({
            data: {
              email: `${randomUUID()}@example.invalid`,
              passwordHash: "test-only",
            },
          });
          const permissions = await tx.permission.findMany({
            where: { code: { in: ["CATALOG_MANAGE", "CATALOG_READ"] } },
          });
          expect(permissions).toHaveLength(2);
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
          let operation = 0;
          const scoped = new Proxy(tx, {
            get(target, property) {
              return property === "$transaction"
                ? async (
                    callback: (
                      transaction: Prisma.TransactionClient,
                    ) => Promise<unknown>,
                  ) => {
                    const savepoint = `fraction_test_${++operation}`;
                    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
                    try {
                      const result = await callback(tx);
                      await tx.$executeRawUnsafe(
                        `RELEASE SAVEPOINT ${savepoint}`,
                      );
                      return result;
                    } catch (error) {
                      await tx.$executeRawUnsafe(
                        `ROLLBACK TO SAVEPOINT ${savepoint}`,
                      );
                      await tx.$executeRawUnsafe(
                        `RELEASE SAVEPOINT ${savepoint}`,
                      );
                      throw error;
                    }
                  }
                : Reflect.get(target, property);
            },
          }) as unknown as PrismaService;
          const catalog = new CatalogService(scoped);
          const linked = await catalog.create(user.id, org.id, {
            name: "Migral x10",
            saleUnit: "BLISTER",
            priceMinor: 1,
            externalReferenceSource: "official",
            externalReferenceName: "Migral",
            externalReferencePresentation: "x20",
            externalReferencePriceMinor: 1285957,
            priceDivisor: 2,
            priceMarkupBps: 1000,
          });
          const price = async (id: string) =>
            (
              await tx.productPrice.findFirstOrThrow({
                where: {
                  productId: id,
                  priceList: { name: "Precio general", organizationId: org.id },
                },
              })
            ).amountMinor;
          expect(await price(linked.id)).toBe(707276n);
          const custom = await tx.priceList.create({
            data: { organizationId: org.id, name: "Custom" },
          });
          await tx.productPrice.create({
            data: {
              productId: linked.id,
              priceListId: custom.id,
              amountMinor: 900000n,
            },
          });
          // Simulate a newly checked raw reference, then change the saved rule.
          await tx.product.update({
            where: { id: linked.id },
            data: { externalReferencePriceMinor: 2000000n },
          });
          await catalog.updateProduct(user.id, org.id, linked.id, {
            priceDivisor: 2,
            priceMarkupBps: 1000,
          });
          expect(await price(linked.id)).toBe(1100000n);
          await catalog.updateProduct(user.id, org.id, linked.id, {
            priceDivisor: 2,
            priceMarkupBps: 1000,
          });
          expect(await price(linked.id)).toBe(1100000n);
          expect(
            (
              await tx.productPrice.findUniqueOrThrow({
                where: {
                  productId_priceListId: {
                    productId: linked.id,
                    priceListId: custom.id,
                  },
                },
              })
            ).amountMinor,
          ).toBe(900000n);
          const manual = await catalog.create(user.id, org.id, {
            name: "Manual pack",
            priceMinor: 0,
            priceDivisor: 4,
            priceMarkupBps: 1000,
            priceBaseMinor: 10000,
          });
          expect(await price(manual.id)).toBe(2750n);
          await catalog.updateProduct(user.id, org.id, manual.id, {
            priceBaseMinor: 20000,
          });
          expect(await price(manual.id)).toBe(5500n);
          await catalog.updateProduct(user.id, org.id, manual.id, {
            name: "Edited name",
          });
          expect(await price(manual.id)).toBe(5500n);
          const listed = (await catalog.list(user.id, org.id)).find(
            (p) => p.id === manual.id,
          )!;
          expect(listed.priceBaseMinor).toBe("20000");
          expect(listed.priceDivisor).toBe(4);
          expect(() => JSON.stringify(listed)).not.toThrow();
          await expect(
            catalog.updateProduct(user.id, org.id, manual.id, {
              name: "Should roll back",
              priceDivisor: 0,
            }),
          ).rejects.toThrow();
          expect(
            (await tx.product.findUniqueOrThrow({ where: { id: manual.id } }))
              .name,
          ).toBe("Edited name");
          expect(await price(manual.id)).toBe(5500n);
          await catalog.updateProduct(user.id, org.id, manual.id, {
            priceDivisor: null,
            priceMinor: 4000,
          });
          expect(await price(manual.id)).toBe(4000n);
          expect(
            (await tx.product.findUniqueOrThrow({ where: { id: manual.id } }))
              .priceBaseMinor,
          ).toBeNull();
          const unlinked = await catalog.create(user.id, org.id, {
            name: "Regular product",
            priceMinor: 1234,
          });
          expect(await price(unlinked.id)).toBe(1234n);
          expect(
            await tx.auditLog.count({
              where: {
                organizationId: org.id,
                action: "PRODUCT_FRACTIONAL_PRICE_CONFIGURED",
              },
            }),
          ).toBeGreaterThanOrEqual(5);
          expect(
            await tx.inventoryMovement.count({
              where: { organizationId: org.id },
            }),
          ).toBe(0);
          throw rollback;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(rollback);
  });
});
