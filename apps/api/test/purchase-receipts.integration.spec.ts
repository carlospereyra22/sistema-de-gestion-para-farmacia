import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { AuditService } from "../src/audit/audit.service";
import { stockAvailability } from "../src/inventory/stock-availability";
import { PartiesService } from "../src/parties/parties.service";
import { SupplierPayablesService } from "../src/supplier-payables/supplier-payables.service";

describe("purchase receipts on an isolated synthetic schema", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `purchase_receipts_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
    url.searchParams.set("schema", schema);
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error("Could not prepare isolated schema");
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    first = new PrismaService(environment);
    second = new PrismaService(environment);
    await Promise.all([first.$connect(), second.$connect()]);
  }, 100000);
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    if (app && /^purchase_receipts_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function fixture(count = 3) {
    const org = await first.organization.create({
      data: { name: "Synthetic purchases" },
    });
    const branch = await first.branch.create({
      data: { organizationId: org.id, name: "Test", code: "TEST" },
    });
    const user = await first.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        passwordHash: "fixture",
      },
    });
    const permissions = await Promise.all(
      [
        "PURCHASE_READ",
        "PURCHASE_MANAGE",
        "PAYABLE_MANAGE",
        "PARTY_MANAGE",
      ].map((code) =>
        first.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const role = await first.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Test",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await first.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        displayName: "Test receiver",
        roles: { create: { roleId: role.id } },
      },
    });
    await first.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const supplier = await first.supplier.create({
      data: { organizationId: org.id, name: "Test supplier" },
    });
    const products = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        first.product.create({
          data: { organizationId: org.id, name: "Product " + i },
        }),
      ),
    );
    const services = [first, second].map(
      (db) => new PurchasesService(db, new AuditService(db)),
    );
    const args = [user.id, org.id, branch.id] as const;
    const input = {
      supplierId: supplier.id,
      clientOperationId: randomUUID(),
      items: products.map((p) => ({
        productId: p.id,
        quantity: 200,
        unitCostMinor: 70000,
      })),
    };
    const create = () => services[0]!.create(...args, input);
    return {
      org,
      branch,
      user,
      supplier,
      products,
      services,
      args,
      input,
      create,
    };
  }
  it("records partial receipt and reviewed debt atomically, retries once, then receives without debt", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    const body = {
      operationId: randomUUID(),
      items: [{ itemId: item.id, quantity: 100, lotNumber: "partial" }],
      debt: { amountMinor: "7000000", dueOn: null },
    };
    const results = await Promise.all(
      f.services.map((s) => s.receive(...f.args, p.id, body)),
    );
    expect(results[0]!.receiptId).toBe(results[1]!.receiptId);
    const invoices = await first.supplierPayableInvoice.findMany({
      where: { purchaseId: p.id },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.amountMinor).toBe(7000000n);
    expect(invoices[0]!.receiptId).toBe(results[0]!.receiptId);
    expect(invoices[0]!.documentKey).toBeNull();
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        ...body,
        debt: { amountMinor: "1", dueOn: null },
      }),
    ).rejects.toThrow();
    await f.services[0]!.receive(...f.args, p.id, {
      operationId: randomUUID(),
      items: [{ itemId: item.id, quantity: 100, lotNumber: "second" }],
    });
    expect(
      await first.supplierPayableInvoice.count({ where: { purchaseId: p.id } }),
    ).toBe(1);
    expect(await first.cashMovement.count()).toBe(0);
  });
  it("rolls back stock and receipt when the debt is invalid or permission is missing", async () => {
    const f = await fixture(1),
      p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    const body = {
      operationId: randomUUID(),
      items: [{ itemId: item.id, quantity: 100, lotNumber: "rollback" }],
      debt: { amountMinor: "0", dueOn: null },
    };
    await expect(
      f.services[0]!.receive(...f.args, p.id, body),
    ).rejects.toThrow();
    await first.rolePermission.deleteMany({
      where: {
        role: { organizationId: f.org.id },
        permission: { code: "PAYABLE_MANAGE" },
      },
    });
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        ...body,
        debt: { amountMinor: "6000000", dueOn: null },
      }),
    ).rejects.toThrow();
    expect(
      await first.purchaseReceipt.count({ where: { purchaseId: p.id } }),
    ).toBe(0);
    expect(
      await first.productLot.count({ where: { organizationId: f.org.id } }),
    ).toBe(0);
    expect(
      (await first.purchaseItem.findUniqueOrThrow({ where: { id: item.id } }))
        .receivedQuantity,
    ).toBe(0);
  });
  it("records direct purchase with adjusted debt and keeps supplier preferences future-only", async () => {
    const f = await fixture(1);
    const parties = new PartiesService(first);
    await parties.updateSupplierTerms(f.user.id, f.org.id, f.supplier.id, {
      accountEnabled: true,
      accountTermDays: 30,
      expectedUpdatedAt: f.supplier.updatedAt.toISOString(),
    });
    await expect(
      parties.updateSupplierTerms(f.user.id, f.org.id, f.supplier.id, {
        accountEnabled: false,
        expectedUpdatedAt: f.supplier.updatedAt.toISOString(),
      }),
    ).rejects.toThrow();
    expect(
      await first.supplierPayableInvoice.count({
        where: { organizationId: f.org.id },
      }),
    ).toBe(0);
    const body = {
      ...f.input,
      debt: { amountMinor: "6500000", dueOn: null },
      receipts: [
        { productId: f.products[0]!.id, quantity: 100, lotNumber: "direct" },
      ],
    };
    const result = await f.services[0]!.direct(...f.args, body);
    expect((await f.services[1]!.direct(...f.args, body)).receiptId).toBe(
      result.receiptId,
    );
    const invoice = await first.supplierPayableInvoice.findFirstOrThrow({
      where: { purchaseId: result.id },
    });
    expect(invoice.amountMinor).toBe(6500000n);
    expect(invoice.receiptId).toBe(result.receiptId);
    await expect(
      parties.updateSupplierTerms(f.user.id, f.org.id, f.supplier.id, {
        accountEnabled: true,
        accountTermDays: -1,
      }),
    ).rejects.toThrow();
  });
  it("detects an existing manually registered purchase debt and blocks duplicate receipt debt", async () => {
    const f = await fixture(1),
      p = await f.create();
    const payables = new SupplierPayablesService(
      first,
      new AuditService(first),
    );
    await payables.create(...f.args, {
      operationId: randomUUID(),
      supplierId: f.supplier.id,
      purchaseId: p.id,
      documentType: "OTRO",
      pointOfSale: "",
      documentNumber: "",
      issuedOn: "2020-01-01",
      amountMinor: "14000000",
      dues: [{ dueOn: null, amountMinor: "14000000" }],
    });
    const detail = await f.services[0]!.detail(...f.args, p.id);
    expect(detail.hasRegisteredDebt).toBe(true);
    expect(
      (await f.services[0]!.list(...f.args)).find((row) => row.id === p.id)
        ?.hasRegisteredDebt,
    ).toBe(true);
    const body = {
      operationId: randomUUID(),
      items: [
        {
          itemId: detail.items[0]!.id,
          quantity: 100,
          lotNumber: "already-invoiced",
        },
      ],
    };
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        ...body,
        debt: { amountMinor: "7000000", dueOn: null },
      }),
    ).rejects.toThrow("deuda registrada");
    expect(
      await first.purchaseReceipt.count({ where: { purchaseId: p.id } }),
    ).toBe(0);
    await f.services[0]!.receive(...f.args, p.id, body);
    expect(
      await first.supplierPayableInvoice.count({ where: { purchaseId: p.id } }),
    ).toBe(1);
  });
  it("preserves multi-line orders without stock, including 50 lines and creation retries", async () => {
    const f = await fixture(50);
    const p = await f.create();
    expect((await f.create()).id).toBe(p.id);
    expect(
      await first.purchase.count({ where: { organizationId: f.org.id } }),
    ).toBe(1);
    expect(
      await first.purchaseItem.count({ where: { purchaseId: p.id } }),
    ).toBe(50);
    expect(
      await first.productLot.count({ where: { organizationId: f.org.id } }),
    ).toBe(0);
  });
  it("regression: receives exactly 200 once and keeps the original lot and cost", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    const input = {
      operationId: randomUUID(),
      items: [
        {
          itemId: item.id,
          quantity: 200,
          lotNumber: "KET-A",
          expiresAt: new Date("2027-12-31"),
        },
      ],
    };
    await Promise.all(f.services.map((s) => s.receive(...f.args, p.id, input)));
    expect(
      (
        await first.productLot.findFirstOrThrow({
          where: { branchId: f.branch.id },
        })
      ).quantity,
    ).toBe(200);
    expect(
      await first.inventoryMovement.count({ where: { referenceId: p.id } }),
    ).toBe(1);
    expect(
      (await f.services[0]!.detail(...f.args, p.id)).receipts[0]!.actorName,
    ).toBe("Test receiver");
  });
  it("receives 100, 60 and 40, rejects excess, and completes the same order", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    for (const [index, quantity] of [100, 60, 40].entries()) {
      await f.services[0]!.receive(...f.args, p.id, {
        operationId: randomUUID(),
        items: [
          {
            itemId: item.id,
            quantity,
            lotNumber: "KET-" + index,
            expiresAt: new Date("2028-06-30"),
          },
        ],
      });
      expect(
        (await first.purchase.findUniqueOrThrow({ where: { id: p.id } }))
          .status,
      ).toBe(index === 2 ? "RECEIVED" : "PARTIALLY_RECEIVED");
      if (index === 0)
        await expect(
          f.services[0]!.receive(...f.args, p.id, {
            operationId: randomUUID(),
            items: [{ itemId: item.id, quantity: 101, lotNumber: "EXCESS" }],
          }),
        ).rejects.toThrow();
    }
    expect(
      (
        await first.productLot.aggregate({
          where: { branchId: f.branch.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(200);
    expect(
      await first.purchaseReceipt.count({ where: { purchaseId: p.id } }),
    ).toBe(3);
  });
  it("receives several lines and lots atomically and rejects invalid lines", async () => {
    const f = await fixture();
    const p = await f.create();
    const items = await first.purchaseItem.findMany({
      where: { purchaseId: p.id },
    });
    const lines = [
      { itemId: items[0]!.id, quantity: 50, lotNumber: "A" },
      { itemId: items[0]!.id, quantity: 50, lotNumber: "B" },
      { itemId: items[1]!.id, quantity: 200, lotNumber: "C" },
    ];
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        operationId: randomUUID(),
        items: [...lines, { itemId: items[2]!.id, quantity: 1, lotNumber: "" }],
      }),
    ).rejects.toThrow();
    expect(
      await first.productLot.count({ where: { branchId: f.branch.id } }),
    ).toBe(0);
    await f.services[0]!.receive(...f.args, p.id, {
      operationId: randomUUID(),
      items: lines,
    });
    expect(
      await first.productLot.count({ where: { branchId: f.branch.id } }),
    ).toBe(3);
    expect(
      (
        await first.purchaseItem.findUniqueOrThrow({
          where: { id: items[0]!.id },
        })
      ).receivedQuantity,
    ).toBe(100);
    expect(
      (
        await first.purchaseItem.findUniqueOrThrow({
          where: { id: items[2]!.id },
        })
      ).receivedQuantity,
    ).toBe(0);
  });
  it("serializes different operations consuming the same remaining quantity", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    const results = await Promise.allSettled(
      f.services.map((s, i) =>
        s.receive(...f.args, p.id, {
          operationId: randomUUID(),
          items: [{ itemId: item.id, quantity: 150, lotNumber: "L" + i }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await first.productLot.aggregate({
          where: { branchId: f.branch.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(150);
  });
  it("closes only the remaining balance and leaves stock intact", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    await f.services[0]!.receive(...f.args, p.id, {
      operationId: randomUUID(),
      items: [{ itemId: item.id, quantity: 100, lotNumber: "A" }],
    });
    await f.services[0]!.closeBalance(...f.args, p.id, "Proveedor no entrega", [
      { itemId: item.id, pending: 100 },
    ]);
    expect(
      (await first.purchaseItem.findUniqueOrThrow({ where: { id: item.id } }))
        .cancelledQuantity,
    ).toBe(100);
    expect(
      (
        await first.productLot.findFirstOrThrow({
          where: { branchId: f.branch.id },
        })
      ).quantity,
    ).toBe(100);
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        operationId: randomUUID(),
        items: [{ itemId: item.id, quantity: 1, lotNumber: "A" }],
      }),
    ).rejects.toThrow();
  });
  it("creates direct purchases and receipts together, retrying without duplicate stock", async () => {
    const f = await fixture(1);
    const input = {
      ...f.input,
      receipts: [
        { productId: f.products[0]!.id, quantity: 200, lotNumber: "DIRECT" },
      ],
    };
    const result = await f.services[0]!.direct(...f.args, input);
    expect((await f.services[0]!.direct(...f.args, input)).id).toBe(result.id);
    expect(
      (
        await first.productLot.findFirstOrThrow({
          where: { branchId: f.branch.id },
        })
      ).quantity,
    ).toBe(200);
    await expect(
      f.services[0]!.direct(...f.args, {
        ...input,
        clientOperationId: randomUUID(),
        receipts: [{ ...input.receipts[0]!, lotNumber: "" }],
      }),
    ).rejects.toThrow();
    expect(
      await first.purchase.count({ where: { organizationId: f.org.id } }),
    ).toBe(1);
  });
  it("preserves sale prices and rolls back an entire multi-lot receipt on a late lot conflict", async () => {
    const f = await fixture(1);
    const list = await first.priceList.create({
      data: { organizationId: f.org.id, name: "Retail" },
    });
    await first.productPrice.create({
      data: {
        productId: f.products[0]!.id,
        priceListId: list.id,
        amountMinor: 99999,
      },
    });
    const originalLot = await first.productLot.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        productId: f.products[0]!.id,
        number: "Z-existing",
        quantity: 5,
        unitCostMinor: 123,
        expiresAt: new Date("2027-01-01"),
      },
    });
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        operationId: randomUUID(),
        items: [
          { itemId: item.id, quantity: 50, lotNumber: "A-new" },
          {
            itemId: item.id,
            quantity: 50,
            lotNumber: "Z-existing",
            expiresAt: new Date("2028-01-01"),
          },
        ],
      }),
    ).rejects.toThrow();
    expect(
      await first.purchaseReceipt.count({ where: { purchaseId: p.id } }),
    ).toBe(0);
    expect(
      await first.inventoryMovement.count({ where: { referenceId: p.id } }),
    ).toBe(0);
    expect(
      await first.productLot.count({ where: { branchId: f.branch.id } }),
    ).toBe(1);
    expect(
      (await first.purchaseItem.findUniqueOrThrow({ where: { id: item.id } }))
        .receivedQuantity,
    ).toBe(0);
    const input = {
      operationId: randomUUID(),
      items: [
        {
          itemId: item.id,
          quantity: 50,
          lotNumber: "Z-existing",
          expiresAt: new Date("2027-01-01"),
        },
      ],
    };
    await f.services[0]!.receive(...f.args, p.id, input);
    await expect(
      f.services[0]!.receive(...f.args, p.id, {
        ...input,
        items: [{ ...input.items[0]!, quantity: 51 }],
      }),
    ).rejects.toThrow();
    expect(
      (
        await first.productLot.findUniqueOrThrow({
          where: { id: originalLot.id },
        })
      ).unitCostMinor,
    ).toBe(123n);
    expect(
      (
        await first.productPrice.findUniqueOrThrow({
          where: {
            productId_priceListId: {
              productId: f.products[0]!.id,
              priceListId: list.id,
            },
          },
        })
      ).amountMinor,
    ).toBe(99999n);
  });
  it("preserves expired physical stock without making it sellable", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const item = await first.purchaseItem.findFirstOrThrow({
      where: { purchaseId: p.id },
    });
    await f.services[0]!.receive(...f.args, p.id, {
      operationId: randomUUID(),
      items: [
        {
          itemId: item.id,
          quantity: 200,
          lotNumber: "EXPIRED",
          expiresAt: new Date("2000-01-01"),
        },
      ],
    });
    const lot = await first.productLot.findFirstOrThrow({
      where: { branchId: f.branch.id },
    });
    expect(lot.quantity).toBe(200);
    expect(stockAvailability(lot).sellableQuantity).toBe(0);
    expect(stockAvailability(lot).expiredQuantity).toBe(200);
  });
  it("reads legacy purchases without inventing receipts or changing existing stock", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const lot = await first.productLot.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        productId: f.products[0]!.id,
        number: "LEGACY",
        quantity: 200,
        unitCostMinor: 70000,
      },
    });
    const movement = await first.inventoryMovement.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        productId: f.products[0]!.id,
        lotId: lot.id,
        type: "PURCHASE_RECEIPT",
        quantity: 200,
        actorId: f.user.id,
        referenceType: "PURCHASE",
        referenceId: p.id,
      },
    });
    await first.purchaseItem.updateMany({
      where: { purchaseId: p.id },
      data: { receivedQuantity: 200 },
    });
    await first.purchase.update({
      where: { id: p.id },
      data: { status: "RECEIVED" },
    });
    const detail = await f.services[0]!.detail(...f.args, p.id);
    expect(detail.receipts).toHaveLength(0);
    expect(detail.legacyMovements[0]!.id).toBe(movement.id);
    expect(detail.legacyMovements[0]!.lotNumber).toBe("LEGACY");
    expect(
      (await first.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
        .quantity,
    ).toBe(200);
  });
  it("rejects other branches, absent permissions and changed retry payloads", async () => {
    const f = await fixture(1);
    const p = await f.create();
    const other = await first.branch.create({
      data: { organizationId: f.org.id, name: "Other", code: "OTHER" },
    });
    await expect(
      f.services[0]!.detail(f.user.id, f.org.id, other.id, p.id),
    ).rejects.toThrow();
    await expect(
      f.services[0]!.create(...f.args, { ...f.input, reference: "Changed" }),
    ).rejects.toThrow();
    await first.userOrganization.update({
      where: {
        userId_organizationId: { userId: f.user.id, organizationId: f.org.id },
      },
      data: { active: false },
    });
    await expect(f.services[0]!.list(...f.args)).rejects.toThrow();
  });
});
