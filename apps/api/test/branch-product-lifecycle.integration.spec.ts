import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  changeBranchProduct,
  reopenForHistoricStock,
} from "../src/catalog/branch-product-lifecycle";
import { CatalogService } from "../src/catalog/catalog.service";
import { SalesService } from "../src/sales/sales.service";
import { AuditService } from "../src/audit/audit.service";

describe("branch product lifecycle (local rollback fixtures)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });
  async function rollback(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const sentinel = new Error("ROLLBACK_BRANCH_PRODUCT");
    await expect(
      prisma.$transaction(
        async (tx) => {
          await run(tx);
          throw sentinel;
        },
        { timeout: 30000 },
      ),
    ).rejects.toBe(sentinel);
  }
  async function fixture(tx: Prisma.TransactionClient) {
    const org = await tx.organization.create({
      data: { name: "Branch product fixture" },
    });
    const a = await tx.branch.create({
      data: { organizationId: org.id, name: "A", code: "A" },
    });
    const b = await tx.branch.create({
      data: { organizationId: org.id, name: "B", code: "B" },
    });
    const admin = await tx.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "fixture",
      },
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: {
          in: ["CATALOG_READ", "CATALOG_MANAGE", "SALE_MANAGE", "SALE_READ"],
        },
      },
    });
    const role = await tx.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Admin",
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
        userId: admin.id,
        roles: { create: { roleId: role.id } },
      },
    });
    await tx.userBranch.createMany({
      data: [a, b].map((branch) => ({ userId: admin.id, branchId: branch.id })),
    });
    const product = await tx.product.create({
      data: { organizationId: org.id, name: "Shared product" },
    });
    const lot = await tx.productLot.create({
      data: {
        organizationId: org.id,
        branchId: a.id,
        productId: product.id,
        number: "OLD",
        quantity: 4,
        unitCostMinor: 200n,
        expiresAt: new Date("2020-01-01"),
      },
    });
    const otherLot = await tx.productLot.create({
      data: {
        organizationId: org.id,
        branchId: b.id,
        productId: product.id,
        number: "B",
        quantity: 9,
        unitCostMinor: 250n,
      },
    });
    const sale = await tx.sale.create({
      data: {
        organizationId: org.id,
        branchId: a.id,
        status: "COMPLETED",
        totalMinor: 600n,
        items: {
          create: {
            productId: product.id,
            lotId: lot.id,
            quantity: 2,
            unitPriceMinor: 300n,
          },
        },
        payments: { create: { method: "CARD", amountMinor: 600n } },
      },
      include: { items: true, payments: true },
    });
    const change = async (
      status: "ACTIVE" | "ARCHIVED" | "DELETED",
      expectedStatus: "ACTIVE" | "ARCHIVED" | "DELETED",
      expectedStock = 4,
      confirmStockWriteOff = true,
    ) =>
      changeBranchProduct(tx, admin.id, org.id, a.id, product.id, {
        status,
        expectedStatus,
        expectedUpdatedAt:
          (
            await tx.productBranchState.findUnique({
              where: {
                branchId_productId: { branchId: a.id, productId: product.id },
              },
            })
          )?.updatedAt.toISOString() ?? null,
        expectedStock,
        confirmStockWriteOff,
        reason: "Retiro del catálogo",
      });
    const catalog = new CatalogService(tx as unknown as PrismaService);
    return { org, a, b, admin, product, lot, otherLot, sale, change, catalog };
  }
  it("archives only the selected branch, preserves stock and allows restoration", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await f.change("ARCHIVED", "ACTIVE");
      expect(
        (await f.catalog.list(f.admin.id, f.org.id, f.a.id))[0]?.active,
      ).toBe(false);
      expect(
        (await f.catalog.list(f.admin.id, f.org.id, f.b.id))[0]?.active,
      ).toBe(true);
      expect(
        (await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
          .quantity,
      ).toBe(4);
      await f.change("ACTIVE", "ARCHIVED");
      expect(
        (await f.catalog.list(f.admin.id, f.org.id, f.a.id))[0]?.active,
      ).toBe(true);
    }));
  function transactionalCatalog(tx: Prisma.TransactionClient) {
    return new CatalogService(
      new Proxy(tx, {
        get(target, key) {
          return key === "$transaction"
            ? (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
                run(tx)
            : Reflect.get(target, key);
        },
      }) as unknown as PrismaService,
    );
  }
  it("rejects a stale stock insertion after permanently deleting an unused product", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const f = await fixture(tx);
        const unused = await tx.product.create({
          data: { organizationId: f.org.id, name: "Unused" },
        });
        await transactionalCatalog(tx).removeUnusedProduct(
          f.admin.id,
          f.org.id,
          unused.id,
        );
        await tx.productLot.create({
          data: {
            organizationId: f.org.id,
            branchId: f.a.id,
            productId: unused.id,
            number: "STALE",
            quantity: 1,
            unitCostMinor: 100n,
          },
        });
      }),
    ).rejects.toThrow("BRANCH_PRODUCT_UNAVAILABLE");
  });
  it("permanently deletes an unused product after archive/restore without deleting audits or other products", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const unused = await tx.product.create({
        data: { organizationId: f.org.id, name: "Unused" },
      });
      await changeBranchProduct(tx, f.admin.id, f.org.id, f.a.id, unused.id, {
        status: "ARCHIVED",
        expectedStatus: "ACTIVE",
        reason: "Test archive",
      });
      const archived = await tx.productBranchState.findUniqueOrThrow({
        where: {
          branchId_productId: { branchId: f.a.id, productId: unused.id },
        },
      });
      await changeBranchProduct(tx, f.admin.id, f.org.id, f.a.id, unused.id, {
        status: "ACTIVE",
        expectedStatus: "ARCHIVED",
        expectedUpdatedAt: archived.updatedAt.toISOString(),
        reason: "Test restore",
      });
      await tx.productBarcode.create({
        data: { productId: unused.id, code: randomUUID(), primary: true },
      });
      await transactionalCatalog(tx).removeUnusedProduct(
        f.admin.id,
        f.org.id,
        unused.id,
      );
      expect(
        await tx.product.findUnique({ where: { id: unused.id } }),
      ).toBeNull();
      expect(
        await tx.productBranchState.count({ where: { productId: unused.id } }),
      ).toBe(0);
      expect(await tx.auditLog.count({ where: { entityId: unused.id } })).toBe(
        3,
      );
      expect(
        await tx.sale.findUnique({
          where: { id: f.sale.id },
          include: { items: true, payments: true },
        }),
      ).toEqual(f.sale);
      expect(
        await tx.product.findUnique({ where: { id: f.product.id } }),
      ).not.toBeNull();
    }));
  it("refuses permanent deletion with history in any branch", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await expect(
        transactionalCatalog(tx).removeUnusedProduct(
          f.admin.id,
          f.org.id,
          f.product.id,
        ),
      ).rejects.toThrow("Usá Archivar");
      expect(
        await tx.sale.findUnique({
          where: { id: f.sale.id },
          include: { items: true, payments: true },
        }),
      ).toEqual(f.sale);
      const product = await tx.product.create({
        data: { organizationId: f.org.id, name: "Only other branch" },
      });
      await tx.productLot.create({
        data: {
          organizationId: f.org.id,
          branchId: f.b.id,
          productId: product.id,
          number: "B",
          quantity: 0,
          unitCostMinor: 100n,
        },
      });
      await expect(
        transactionalCatalog(tx).removeUnusedProduct(
          f.admin.id,
          f.org.id,
          product.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }));
  it("requires archive, current quantity and explicit stock confirmation", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await expect(f.change("DELETED", "ACTIVE")).rejects.toBeInstanceOf(
        ConflictException,
      );
      await f.change("ARCHIVED", "ACTIVE");
      await expect(f.change("DELETED", "ARCHIVED", 3)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        f.change("DELETED", "ARCHIVED", 4, false),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await tx.inventoryMovement.count({
          where: { productId: f.product.id },
        }),
      ).toBe(0);
    }));
  it("writes off expired stock once, hides branch catalog only and preserves sales/payments/lots", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await f.change("ARCHIVED", "ACTIVE");
      await f.change("DELETED", "ARCHIVED");
      await f.change("DELETED", "ARCHIVED");
      expect(await f.catalog.list(f.admin.id, f.org.id, f.a.id)).toHaveLength(
        0,
      );
      expect(await f.catalog.list(f.admin.id, f.org.id, f.b.id)).toHaveLength(
        1,
      );
      expect(
        await tx.sale.findUnique({
          where: { id: f.sale.id },
          include: { items: true, payments: true },
        }),
      ).toEqual(f.sale);
      expect(
        (await tx.product.findUniqueOrThrow({ where: { id: f.product.id } }))
          .active,
      ).toBe(true);
      expect(
        (await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
          .quantity,
      ).toBe(0);
      expect(
        (
          await tx.productLot.findUniqueOrThrow({
            where: { id: f.otherLot.id },
          })
        ).quantity,
      ).toBe(9);
      const moves = await tx.inventoryMovement.findMany({
        where: { productId: f.product.id },
      });
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({
        branchId: f.a.id,
        quantity: -4,
        type: "ADJUSTMENT_OUT",
        actorId: f.admin.id,
      });
      expect(
        await tx.auditLog.count({
          where: { entityId: f.product.id, action: "BRANCH_PRODUCT_DELETED" },
        }),
      ).toBe(1);
    }));
  it("denies non-admin and inaccessible branches", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await tx.userBranch.delete({
        where: { userId_branchId: { userId: f.admin.id, branchId: f.a.id } },
      });
      await expect(f.change("ARCHIVED", "ACTIVE")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await tx.userBranch.create({
        data: { userId: f.admin.id, branchId: f.a.id },
      });
      await tx.role.updateMany({
        where: { organizationId: f.org.id },
        data: { code: "CASHIER" },
      });
      await expect(f.change("ARCHIVED", "ACTIVE")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }));
  it("blocks removal while transfers are pending", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await tx.transfer.create({
        data: {
          organizationId: f.org.id,
          sourceBranchId: f.a.id,
          destinationBranchId: f.b.id,
          status: "IN_TRANSIT",
          items: {
            create: { productId: f.product.id, lotId: f.lot.id, quantity: 1 },
          },
        },
      });
      await f.change("ARCHIVED", "ACTIVE");
      await expect(f.change("DELETED", "ARCHIVED")).rejects.toBeInstanceOf(
        ConflictException,
      );
    }));
  it("reopens as archived for historic compensation, never restores sale availability automatically", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await f.change("ARCHIVED", "ACTIVE");
      const originalVersion = (
        await tx.productBranchState.findUniqueOrThrow({
          where: {
            branchId_productId: { branchId: f.a.id, productId: f.product.id },
          },
        })
      ).updatedAt.toISOString();
      await f.change("DELETED", "ARCHIVED");
      await reopenForHistoricStock(
        tx,
        f.admin.id,
        f.org.id,
        f.a.id,
        f.product.id,
        f.sale.id,
      );
      await tx.productLot.update({
        where: { id: f.lot.id },
        data: { quantity: { increment: 2 } },
      });
      const products = await f.catalog.list(f.admin.id, f.org.id, f.a.id);
      expect(products[0]).toMatchObject({
        active: false,
        branchStatus: "ARCHIVED",
      });
      await expect(
        changeBranchProduct(tx, f.admin.id, f.org.id, f.a.id, f.product.id, {
          status: "DELETED",
          expectedStatus: "ARCHIVED",
          expectedUpdatedAt: originalVersion,
          expectedStock: 2,
          confirmStockWriteOff: true,
          reason: "Stale confirmation",
        }),
      ).rejects.toThrow("El estado cambió");
      expect(
        (await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
          .quantity,
      ).toBe(2);
      expect(
        await tx.auditLog.count({
          where: {
            entityId: f.product.id,
            action: "BRANCH_PRODUCT_HISTORIC_STOCK_RESTORED",
          },
        }),
      ).toBe(1);
    }));
  it("can cancel a historic sale after removal and keeps its original item and payment", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await f.change("ARCHIVED", "ACTIVE");
      await f.change("DELETED", "ARCHIVED");
      const scoped = new Proxy(tx, {
        get(target, key) {
          return key === "$transaction"
            ? (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
                run(tx)
            : Reflect.get(target, key);
        },
      }) as unknown as PrismaService;
      const sales = new SalesService(scoped, new AuditService(scoped));
      await sales.cancel(
        f.admin.id,
        f.org.id,
        f.a.id,
        f.sale.id,
        "Error en venta histórica",
      );
      expect(
        (await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }))
          .quantity,
      ).toBe(2);
      expect(
        (await f.catalog.list(f.admin.id, f.org.id, f.a.id))[0],
      ).toMatchObject({ active: false, branchStatus: "ARCHIVED" });
      expect(
        await tx.saleItem.findMany({ where: { saleId: f.sale.id } }),
      ).toEqual(f.sale.items);
      expect(
        await tx.salePayment.findMany({ where: { saleId: f.sale.id } }),
      ).toEqual(f.sale.payments);
      expect(
        await tx.inventoryMovement.count({
          where: { productId: f.product.id, type: "SALE_CANCELLATION" },
        }),
      ).toBe(1);
    }));
  it("refuses pending purchases and accepts deletion with zero stock without a write-off", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const supplier = await tx.supplier.create({
        data: { organizationId: f.org.id, name: "Fixture" },
      });
      const purchase = await tx.purchase.create({
        data: {
          organizationId: f.org.id,
          branchId: f.a.id,
          supplierId: supplier.id,
          status: "ORDERED",
          items: {
            create: {
              productId: f.product.id,
              orderedQuantity: 2,
              unitCostMinor: 100n,
            },
          },
        },
      });
      await f.change("ARCHIVED", "ACTIVE");
      await expect(f.change("DELETED", "ARCHIVED")).rejects.toBeInstanceOf(
        ConflictException,
      );
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "CANCELLED" },
      });
      await tx.productLot.update({
        where: { id: f.lot.id },
        data: { quantity: 0 },
      });
      await f.change("DELETED", "ARCHIVED", 0, false);
      expect(
        await tx.inventoryMovement.count({
          where: { productId: f.product.id },
        }),
      ).toBe(0);
    }));
  it("rejects stale expected state and cross-organization product access", () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      await f.change("ARCHIVED", "ACTIVE");
      await expect(f.change("ACTIVE", "ACTIVE")).rejects.toBeInstanceOf(
        ConflictException,
      );
      const other = await tx.organization.create({
        data: { name: "Other tenant" },
      });
      const alien = await tx.product.create({
        data: { organizationId: other.id, name: "Alien" },
      });
      await expect(
        changeBranchProduct(tx, f.admin.id, f.org.id, f.a.id, alien.id, {
          status: "ARCHIVED",
          expectedStatus: "ACTIVE",
          reason: "Not allowed",
        }),
      ).rejects.toThrow("Producto no encontrado");
    }));
  it.each(["sale", "stock", "purchase", "transfer"])(
    "database guards prevent stale %s writes after lifecycle changes",
    async (kind) => {
      await expect(
        prisma.$transaction(async (tx) => {
          const f = await fixture(tx);
          await f.change("ARCHIVED", "ACTIVE");
          if (kind === "sale")
            await tx.saleItem.create({
              data: {
                saleId: f.sale.id,
                productId: f.product.id,
                lotId: f.lot.id,
                quantity: 1,
                unitPriceMinor: 300n,
              },
            });
          else if (kind === "stock") {
            await f.change("DELETED", "ARCHIVED");
            await tx.productLot.update({
              where: { id: f.lot.id },
              data: { quantity: 1 },
            });
          } else if (kind === "purchase") {
            const supplier = await tx.supplier.create({
              data: { organizationId: f.org.id, name: "Fixture" },
            });
            await tx.purchase.create({
              data: {
                organizationId: f.org.id,
                branchId: f.a.id,
                supplierId: supplier.id,
                items: {
                  create: {
                    productId: f.product.id,
                    orderedQuantity: 1,
                    unitCostMinor: 100n,
                  },
                },
              },
            });
          } else {
            await tx.transfer.create({
              data: {
                organizationId: f.org.id,
                sourceBranchId: f.b.id,
                destinationBranchId: f.a.id,
                items: {
                  create: {
                    productId: f.product.id,
                    lotId: f.otherLot.id,
                    quantity: 1,
                  },
                },
              },
            });
          }
        }),
      ).rejects.toThrow(/BRANCH_PRODUCT/);
    },
  );
});
