import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CashService } from "../src/cash/cash.service";
import { InventoryService } from "../src/inventory/inventory.service";

describe("record maintenance in isolated local rollback transactions", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function fixture(tx: Prisma.TransactionClient) {
    const org = await tx.organization.create({
      data: { name: "Maintenance fixture" },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, code: "MAIN", name: "Central" },
    });
    const otherBranch = await tx.branch.create({
      data: { organizationId: org.id, code: "OTHER", name: "Other" },
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: {
          in: [
            "CASH_READ",
            "CASH_MANAGE",
            "INVENTORY_READ",
            "INVENTORY_MANAGE",
          ],
        },
      },
    });
    expect(permissions).toHaveLength(4);
    const createUser = async (code: string, granted: typeof permissions) => {
      const user = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          passwordHash: "fixture",
        },
      });
      const role = await tx.role.create({
        data: {
          organizationId: org.id,
          code,
          name: code,
          permissions: { create: granted.map((p) => ({ permissionId: p.id })) },
        },
      });
      await tx.userOrganization.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          roles: { create: { roleId: role.id } },
        },
      });
      return user;
    };
    const admin = await createUser("ADMIN", permissions);
    const cashier = await createUser("CASHIER", permissions);
    const viewer = await createUser(
      "VIEWER",
      permissions.filter((p) => p.code.endsWith("_READ")),
    );
    const scoped = new Proxy(tx, {
      get(target, key) {
        return key === "$transaction"
          ? (fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
              fn(tx)
          : Reflect.get(target, key);
      },
    }) as unknown as PrismaService;
    const audit = new AuditService(scoped);
    const cash = new CashService(scoped, audit);
    const inventory = new InventoryService(scoped, audit);
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Central" },
    });
    const product = await tx.product.create({
      data: { organizationId: org.id, name: "Product" },
    });
    const lot = await tx.productLot.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        productId: product.id,
        number: "Original",
        expiresAt: new Date("2099-10-30"),
        quantity: 8,
        unitCostMinor: 200n,
      },
    });
    return {
      org,
      branch,
      otherBranch,
      admin,
      cashier,
      viewer,
      cash,
      inventory,
      register,
      lot,
      product,
    };
  }
  async function rollback(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const sentinel = new Error("ROLLBACK_MAINTENANCE_FIXTURE");
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

  it("archives/restores closures only for admins without changing balances or deleting records", async () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const session = await f.cash.open(f.admin.id, f.org.id, f.branch.id, {
        cashRegisterId: f.register.id,
        openingAmountMinor: 10000,
      });
      await expect(
        f.cash.archiveClosure(
          f.admin.id,
          f.org.id,
          f.branch.id,
          session.id,
          true,
          "Correction",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await f.cash.movement(f.admin.id, f.org.id, f.branch.id, session.id, {
        type: "OUT",
        amountMinor: 1000,
        reason: "Expense",
      });
      await f.cash.close(f.admin.id, f.org.id, f.branch.id, session.id, {
        closingAmountMinor: 9000,
      });
      const before = await f.cash.closures(f.admin.id, f.org.id, f.branch.id);
      await expect(
        f.cash.archiveClosure(
          f.cashier.id,
          f.org.id,
          f.branch.id,
          session.id,
          true,
          "Correction",
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.cash.archiveClosure(
          f.admin.id,
          f.org.id,
          f.otherBranch.id,
          session.id,
          true,
          "Correction",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        f.cash.archiveClosure(
          f.admin.id,
          f.org.id,
          f.branch.id,
          session.id,
          true,
          " ",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await f.cash.archiveClosure(
        f.admin.id,
        f.org.id,
        f.branch.id,
        session.id,
        true,
        "Duplicate display",
      );
      await f.cash.archiveClosure(
        f.admin.id,
        f.org.id,
        f.branch.id,
        session.id,
        true,
        "Repeated request",
      );
      expect(
        await f.cash.closures(f.admin.id, f.org.id, f.branch.id),
      ).toHaveLength(0);
      const archived = await f.cash.closures(
        f.admin.id,
        f.org.id,
        f.branch.id,
        undefined,
        undefined,
        true,
      );
      expect(archived[0]).toMatchObject({
        expectedAmountMinor: "9000",
        differenceMinor: "0",
      });
      expect(
        await tx.cashMovement.count({ where: { cashSessionId: session.id } }),
      ).toBe(1);
      expect(
        await tx.auditLog.count({
          where: { entityId: session.id, action: "ARCHIVED" },
        }),
      ).toBe(1);
      await expect(
        f.cash.closures(
          f.cashier.id,
          f.org.id,
          f.branch.id,
          undefined,
          undefined,
          true,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await f.cash.archiveClosure(
        f.admin.id,
        f.org.id,
        f.branch.id,
        session.id,
        false,
        "Restore closure",
      );
      expect(await f.cash.closures(f.admin.id, f.org.id, f.branch.id)).toEqual(
        before,
      );
    }));

  it("edits, archives and restores registers, blocks open sessions and stale/cross-branch edits", async () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const input = {
        name: "Renamed",
        active: true,
        expectedName: f.register.name,
        expectedActive: true,
      };
      await expect(
        f.cash.editRegister(
          f.viewer.id,
          f.org.id,
          f.branch.id,
          f.register.id,
          input,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.cash.editRegister(
          f.admin.id,
          f.org.id,
          f.otherBranch.id,
          f.register.id,
          input,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await f.cash.editRegister(
        f.admin.id,
        f.org.id,
        f.branch.id,
        f.register.id,
        input,
      );
      await expect(
        f.cash.editRegister(
          f.admin.id,
          f.org.id,
          f.branch.id,
          f.register.id,
          input,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      const session = await f.cash.open(f.admin.id, f.org.id, f.branch.id, {
        cashRegisterId: f.register.id,
        openingAmountMinor: 0,
      });
      const archive = { ...input, expectedName: "Renamed", active: false };
      await expect(
        f.cash.editRegister(
          f.admin.id,
          f.org.id,
          f.branch.id,
          f.register.id,
          archive,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await f.cash.close(f.admin.id, f.org.id, f.branch.id, session.id, {
        closingAmountMinor: 0,
      });
      await f.cash.editRegister(
        f.admin.id,
        f.org.id,
        f.branch.id,
        f.register.id,
        archive,
      );
      expect(
        (await f.cash.list(f.admin.id, f.org.id, f.branch.id)).registers,
      ).toHaveLength(0);
      expect(
        await f.cash.closures(f.admin.id, f.org.id, f.branch.id),
      ).toHaveLength(1);
      await expect(
        f.cash.open(f.admin.id, f.org.id, f.branch.id, {
          cashRegisterId: f.register.id,
          openingAmountMinor: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await f.cash.editRegister(
        f.admin.id,
        f.org.id,
        f.branch.id,
        f.register.id,
        { ...archive, expectedActive: false, active: true },
      );
      expect(
        (await f.cash.list(f.admin.id, f.org.id, f.branch.id)).registers,
      ).toHaveLength(1);
    }));

  it("corrects lot metadata with audit/version while preserving quantity, cost and movements", async () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const input = {
        number: "Corrected",
        expiresAt: "2000-01-01",
        expectedVersion: 0,
        reason: "Checked physical packaging",
      };
      await expect(
        f.inventory.editLot(
          f.viewer.id,
          f.org.id,
          f.branch.id,
          f.lot.id,
          input,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.inventory.editLot(
          f.admin.id,
          f.org.id,
          f.otherBranch.id,
          f.lot.id,
          input,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
          ...input,
          expiresAt: "2026-02-30",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await f.inventory.editLot(
        f.admin.id,
        f.org.id,
        f.branch.id,
        f.lot.id,
        input,
      );
      expect(
        await tx.productLot.findUnique({ where: { id: f.lot.id } }),
      ).toMatchObject({
        quantity: 8,
        unitCostMinor: 200n,
        number: "Corrected",
        metadataVersion: 1,
      });
      expect(
        (await f.inventory.stock(f.admin.id, f.org.id, f.branch.id))[0],
      ).toMatchObject({ sellableQuantity: 0, expiredQuantity: 8 });
      expect(
        await tx.inventoryMovement.count({ where: { lotId: f.lot.id } }),
      ).toBe(0);
      const audit = await tx.auditLog.findFirstOrThrow({
        where: { entityId: f.lot.id, action: "METADATA_UPDATED" },
      });
      expect(audit.before).toMatchObject({
        number: "Original",
        metadataVersion: 0,
      });
      expect(audit.after).toMatchObject({
        number: "Corrected",
        reason: input.reason,
      });
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, input),
      ).rejects.toBeInstanceOf(ConflictException);
      await f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
        ...input,
        expiresAt: null,
        expectedVersion: 1,
      });
      expect(
        (await f.inventory.stock(f.admin.id, f.org.id, f.branch.id))[0],
      ).toMatchObject({
        sellableQuantity: 8,
        expiresAt: null,
        metadataVersion: 2,
      });
      await f.inventory.receive(f.admin.id, {
        organizationId: f.org.id,
        branchId: f.branch.id,
        productId: f.product.id,
        lotNumber: input.number,
        quantity: 1,
        unitCostMinor: 200,
        expiresAt: new Date("2099-01-01"),
      });
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
          ...input,
          expectedVersion: 2,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await tx.transfer.create({
        data: {
          organizationId: f.org.id,
          sourceBranchId: f.branch.id,
          destinationBranchId: f.otherBranch.id,
          status: "IN_TRANSIT",
          items: {
            create: { lotId: f.lot.id, productId: f.product.id, quantity: 1 },
          },
        },
      });
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
          ...input,
          expectedVersion: 3,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    }));

  it("corrects only the selected lot cost with exact cents, audit and stale-write protection", async () =>
    rollback(async (tx) => {
      const f = await fixture(tx);
      const other = await tx.productLot.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          productId: f.product.id,
          number: "Other cost",
          quantity: 5,
          unitCostMinor: 700n,
        },
      });
      const input = {
        number: f.lot.number,
        expiresAt: "2099-10-30",
        expectedVersion: 0,
        reason: "Correct purchase cost",
        unitCostMinor: "12345678901234",
      };
      await expect(
        f.inventory.editLot(
          f.viewer.id,
          f.org.id,
          f.branch.id,
          f.lot.id,
          input,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        f.inventory.editLot(
          f.admin.id,
          f.org.id,
          f.otherBranch.id,
          f.lot.id,
          input,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      for (const cost of ["-1", "1.5", "", "100000000000000"]) {
        await expect(
          f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
            ...input,
            unitCostMinor: cost,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
          ...input,
          reason: " ",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await f.inventory.editLot(
        f.admin.id,
        f.org.id,
        f.branch.id,
        f.lot.id,
        input,
      );
      expect(
        await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }),
      ).toMatchObject({
        unitCostMinor: 12345678901234n,
        quantity: 8,
        metadataVersion: 1,
      });
      expect(
        await tx.productLot.findUniqueOrThrow({ where: { id: other.id } }),
      ).toEqual(other);
      const audit = await tx.auditLog.findFirstOrThrow({
        where: { entityId: f.lot.id, action: "METADATA_UPDATED" },
      });
      expect(audit.before).toMatchObject({ unitCostMinor: "200" });
      expect(audit.after).toMatchObject({
        unitCostMinor: input.unitCostMinor,
        reason: input.reason,
      });
      expect(
        await tx.inventoryMovement.count({ where: { lotId: f.lot.id } }),
      ).toBe(0);
      await expect(
        f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, input),
      ).rejects.toBeInstanceOf(ConflictException);
      await f.inventory.editLot(f.admin.id, f.org.id, f.branch.id, f.lot.id, {
        ...input,
        expectedVersion: 1,
        unitCostMinor: "0",
      });
      expect(
        await tx.productLot.findUniqueOrThrow({ where: { id: f.lot.id } }),
      ).toMatchObject({ unitCostMinor: 0n });
    }));

  it("rejects duplicate lot numbers without merging or losing stock", async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const f = await fixture(tx);
          await tx.productLot.create({
            data: {
              organizationId: f.org.id,
              branchId: f.branch.id,
              productId: f.product.id,
              number: "Duplicate",
              quantity: 3,
              unitCostMinor: 300n,
            },
          });
          await f.inventory.editLot(
            f.admin.id,
            f.org.id,
            f.branch.id,
            f.lot.id,
            {
              number: "Duplicate",
              expiresAt: null,
              expectedVersion: 0,
              reason: "Correction",
            },
          );
        },
        { timeout: 30000 },
      ),
    ).rejects.toThrow("Ya existe ese número de lote");
  });
});
