import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { InventoryService } from "../src/inventory/inventory.service";
import {
  loadLotHistories,
  lotSupplierBreakdown,
} from "../src/inventory/lot-suppliers";
import { PurchasesService } from "../src/purchases/purchases.service";
import { SalesService } from "../src/sales/sales.service";

// Abrir cajas (SISTEMA-103): Buscapina x100 se abre en 10 Buscapina blíster x10,
// con el mismo lote y vencimiento.
describe("abrir cajas (base local, fixtures con rollback)", () => {
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
    run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
  ) => {
    const rollback = new Error("ROLLBACK_ABRIR_CAJAS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          await run(await fixture(tx));
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  };

  async function fixture(tx: Prisma.TransactionClient) {
    const org = await tx.organization.create({
      data: { name: "Abrir cajas fixture" },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Centro", code: "CEN" },
    });
    const user = await tx.user.create({
      data: { email: `${randomUUID()}@example.invalid`, passwordHash: "t" },
    });
    const permissions = await Promise.all(
      [
        "CATALOG_MANAGE",
        "CATALOG_READ",
        "PURCHASE_READ",
        "PURCHASE_MANAGE",
        "PURCHASE_RECEIVE",
        "SALE_MANAGE",
        "SALE_READ",
        "CASH_READ",
        "CASH_MANAGE",
        "INVENTORY_READ",
        "INVENTORY_MANAGE",
      ].map((code) =>
        tx.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const role = await tx.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Admin",
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
    await tx.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const supplier = await tx.supplier.create({
      data: { organizationId: org.id, name: "Droguería" },
    });
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Mostrador" },
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
          ? (fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
              fn(tx)
          : Reflect.get(target, key);
      },
    }) as unknown as PrismaService;
    const audit = new AuditService(scoped);
    const catalog = new CatalogService(scoped);
    const inventory = new InventoryService(scoped, audit);
    const purchases = new PurchasesService(scoped, audit);
    const sales = new SalesService(scoped, audit);
    const { id: blister } = await catalog.create(user.id, org.id, {
      name: "Buscapina Duo blíster comp.rec. x 10",
      priceMinor: 1_127_800,
    });
    const { id: caja } = await catalog.create(user.id, org.id, {
      name: "Buscapina Duo comp.rec. x 100",
      priceMinor: 9_000_000,
      splitTargetProductId: blister,
      splitFactor: 10,
    });
    const buy = (
      lotNumber: string,
      boxes: number,
      expiresAt: Date,
      openBoxes?: number,
    ) =>
      purchases.direct(user.id, org.id, branch.id, {
        supplierId: supplier.id,
        clientOperationId: randomUUID(),
        items: [{ productId: caja, quantity: boxes, unitCostMinor: 600_000 }],
        receipts: [
          {
            productId: caja,
            quantity: boxes,
            lotNumber,
            expiresAt,
            ...(openBoxes ? { openBoxes } : {}),
          },
        ],
      });
    const lot = (productId: string, number: string) =>
      tx.productLot.findUnique({
        where: {
          branchId_productId_number: {
            branchId: branch.id,
            productId,
            number,
          },
        },
      });
    const split = (
      lotId: string,
      boxes: number,
      requestId = randomUUID(),
      otro: { targetProductId?: string; factor?: number } = {},
    ) =>
      inventory.split(user.id, org.id, branch.id, {
        requestId,
        lotId,
        boxes,
        ...otro,
      });
    return {
      tx,
      org,
      branch,
      user,
      supplier,
      session,
      catalog,
      inventory,
      purchases,
      sales,
      blister,
      caja,
      buy,
      lot,
      split,
    };
  }

  const vence = new Date("2027-05-31");

  it("abre cajas al blíster con el mismo lote, vencimiento, costo y proveedor", async () => {
    await withFixture(async (f) => {
      await f.buy("L1", 3, vence);
      const origen = (await f.lot(f.caja, "L1"))!;
      const requestId = randomUUID();
      const abierta = await f.split(origen.id, 2, requestId);
      expect(abierta).toMatchObject({ boxes: 2, units: 20 });
      expect((await f.lot(f.caja, "L1"))!.quantity).toBe(1);
      const destino = (await f.lot(f.blister, "L1"))!;
      expect(destino).toMatchObject({
        quantity: 20,
        expiresAt: vence,
        unitCostMinor: 60_000n,
      });

      // Reintento: no duplica. Mismo pedido con otros datos: 409.
      expect((await f.split(origen.id, 2, requestId)).id).toBe(abierta.id);
      expect((await f.lot(f.blister, "L1"))!.quantity).toBe(20);
      await expect(f.split(origen.id, 1, requestId)).rejects.toThrow(
        "otros datos",
      );

      // El blíster conserva el proveedor de la caja.
      const history = (await loadLotHistories(f.tx, [destino.id])).get(
        destino.id,
      )!;
      expect([...lotSupplierBreakdown(20, history)]).toEqual([
        [f.supplier.id, 20],
      ]);
      expect(
        await f.tx.inventoryMovement.findMany({
          where: { referenceType: "STOCK_SPLIT", referenceId: abierta.id },
          select: { type: true, quantity: true, productId: true },
          orderBy: { quantity: "asc" },
        }),
      ).toEqual([
        { type: "ADJUSTMENT_OUT", quantity: -2, productId: f.caja },
        { type: "ADJUSTMENT_IN", quantity: 20, productId: f.blister },
      ]);

      // No se abren más cajas que las que hay.
      await expect(f.split(origen.id, 2)).rejects.toThrow(
        "tiene 1 caja para abrir",
      );

      // El blíster abierto se vende normalmente.
      await f.sales.complete(f.user.id, f.org.id, f.branch.id, {
        clientOperationId: randomUUID(),
        items: [{ productId: f.blister, quantity: 2 }],
        payments: [
          {
            method: "CASH",
            amountMinor: 2 * 1_127_800,
            cashSessionId: f.session.id,
          },
        ],
      });
      expect((await f.lot(f.blister, "L1"))!.quantity).toBe(18);
    });
  });

  it("rechaza abrir sobre un lote del blíster con otro vencimiento", async () => {
    await withFixture(async (f) => {
      await f.buy("L2", 1, vence);
      await f.tx.productLot.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          productId: f.blister,
          number: "L2",
          expiresAt: new Date("2026-12-31"),
          quantity: 5,
          unitCostMinor: 60_000n,
        },
      });
      await expect(f.split((await f.lot(f.caja, "L2"))!.id, 1)).rejects.toThrow(
        "otro vencimiento",
      );
    });
  });

  it("recibe la compra ya abierta en blísteres", async () => {
    await withFixture(async (f) => {
      await f.buy("L3", 3, vence, 2);
      expect((await f.lot(f.caja, "L3"))!.quantity).toBe(1);
      expect((await f.lot(f.blister, "L3"))!.quantity).toBe(20);
      expect(
        await f.tx.stockSplit.count({
          where: { organizationId: f.org.id, purchaseReceiptId: { not: null } },
        }),
      ).toBe(1);
    });
  });

  it("valida el vínculo: sin ciclos y sin abrir productos sin vínculo", async () => {
    await withFixture(async (f) => {
      await expect(
        f.catalog.updateProduct(f.user.id, f.org.id, f.blister, {
          splitTargetProductId: f.caja,
          splitFactor: 10,
        }),
      ).rejects.toThrow("ya se abre en esta caja");
      const lote = await f.tx.productLot.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          productId: f.blister,
          number: "SUELTO",
          quantity: 5,
          unitCostMinor: 1n,
        },
      });
      await expect(f.split(lote.id, 1)).rejects.toThrow(
        "Elegí en qué producto se abre",
      );
    });
  });

  it("abre en otra presentación elegida al momento (x100 en x20)", async () => {
    await withFixture(async (f) => {
      const { id: x20 } = await f.catalog.create(f.user.id, f.org.id, {
        name: "Buscapina Duo comp.rec. x 20",
        priceMinor: 2_000_000,
      });
      await f.buy("L4", 2, vence);
      const origen = (await f.lot(f.caja, "L4"))!;
      await expect(
        f.split(origen.id, 1, randomUUID(), { targetProductId: x20 }),
      ).rejects.toThrow("cuántas unidades");
      await f.split(origen.id, 1, randomUUID(), {
        targetProductId: x20,
        factor: 5,
      });
      expect((await f.lot(x20, "L4"))!).toMatchObject({
        quantity: 5,
        expiresAt: vence,
        unitCostMinor: 120_000n,
      });
      // El vínculo sigue siendo el blíster x10.
      await f.split(origen.id, 1);
      expect((await f.lot(f.blister, "L4"))!.quantity).toBe(10);
    });
  });

  it("sin conexión abre al volver, una sola vez y hasta las cajas que hay", async () => {
    await withFixture(async (f) => {
      await f.buy("L5", 3, vence);
      const origen = (await f.lot(f.caja, "L5"))!;
      const op = {
        tipo: "APERTURA" as const,
        clientOperationId: randomUUID(),
        occurredAt: new Date(Date.now() - 10 * 60000).toISOString(),
        deviceId: randomUUID(),
        cuerpo: { lote: { lotId: origen.id }, boxes: 5 },
      };
      const primera = await f.inventory.inventoryOffline(
        f.user.id,
        f.org.id,
        f.branch.id,
        op,
      );
      // Se pidieron 5 y había 3: se abren 3, con aviso.
      expect(
        (primera as { offlineIssues: { kind: string }[] }).offlineIssues.map(
          (i) => i.kind,
        ),
      ).toEqual(["AJUSTE_SUPERA_STOCK"]);
      expect((await f.lot(f.caja, "L5"))!.quantity).toBe(0);
      expect((await f.lot(f.blister, "L5"))!.quantity).toBe(30);
      // Reenviar la misma operación no abre de nuevo.
      await f.inventory.inventoryOffline(f.user.id, f.org.id, f.branch.id, op);
      expect((await f.lot(f.blister, "L5"))!.quantity).toBe(30);
      expect(
        await f.tx.stockSplit.count({
          where: { requestId: op.clientOperationId },
        }),
      ).toBe(1);
    });
  });

  it("una compra hecha sin conexión entra aunque no se pueda abrir la caja", async () => {
    await withFixture(async (f) => {
      await f.tx.productLot.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          productId: f.blister,
          number: "L6",
          expiresAt: new Date("2026-12-31"),
          quantity: 5,
          unitCostMinor: 60_000n,
        },
      });
      await f.purchases.direct(f.user.id, f.org.id, f.branch.id, {
        supplierId: f.supplier.id,
        clientOperationId: randomUUID(),
        occurredAt: new Date(Date.now() - 5 * 60000),
        items: [{ productId: f.caja, quantity: 2, unitCostMinor: 600_000 }],
        receipts: [
          {
            productId: f.caja,
            quantity: 2,
            lotNumber: "L6",
            expiresAt: vence,
            openBoxes: 2,
          },
        ],
      });
      expect((await f.lot(f.caja, "L6"))!.quantity).toBe(2);
      expect((await f.lot(f.blister, "L6"))!.quantity).toBe(5);
      expect(
        await f.tx.auditLog.count({
          where: { organizationId: f.org.id, action: "STOCK_SPLIT_SKIPPED" },
        }),
      ).toBe(1);
    });
  });
});
