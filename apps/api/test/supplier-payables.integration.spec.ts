import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AuditService } from "../src/audit/audit.service";
import { SupplierPayablesService } from "../src/supplier-payables/supplier-payables.service";
import { PartiesService } from "../src/parties/parties.service";
import type { PayableInput } from "../src/supplier-payables/payable-rules";

describe("supplier invoices isolated schema", () => {
  let app: TestingModule, db: PrismaService, otherDb: PrismaService;
  const schema = `supplier_payables_${randomUUID().replaceAll("-", "")}`;
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
      throw new Error(
        "Could not prepare isolated schema: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    db = new PrismaService(environment);
    otherDb = new PrismaService(environment);
    await Promise.all([db.$connect(), otherDb.$connect()]);
  }, 100000);
  afterAll(async () => {
    await Promise.all([db?.$disconnect(), otherDb?.$disconnect()]);
    if (app && /^supplier_payables_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });
  async function fixture() {
    const org = await db.organization.create({
      data: { name: "Synthetic payable" },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Test", code: "T" },
    });
    const user = await db.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        passwordHash: "fixture",
      },
    });
    const permissions = await db.permission.findMany({
      where: { code: { in: ["PAYABLE_READ", "PAYABLE_MANAGE"] } },
    });
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Test",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        displayName: "Test operator",
        roles: { create: { roleId: role.id } },
      },
    });
    await db.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const supplier = await db.supplier.create({
      data: { organizationId: org.id, name: "Supplier" },
    });
    const input: PayableInput = {
      operationId: randomUUID(),
      supplierId: supplier.id,
      documentType: "FACTURA_A",
      pointOfSale: "0003",
      documentNumber: "00001245",
      issuedOn: "2020-01-01",
      amountMinor: "50000000",
      dues: [{ dueOn: "2020-02-01", amountMinor: "50000000" }],
    };
    const services = [db, otherDb].map(
      (p) => new SupplierPayablesService(p, new AuditService(p)),
    );
    const args = [user.id, org.id, branch.id] as const;
    return { org, branch, user, supplier, input, services, args };
  }
  it("creates a manual document atomically, with dues and no stock, purchase, cash or customer entries", async () => {
    const f = await fixture();
    const result = await f.services[0]!.create(...f.args, f.input);
    const detail = await f.services[0]!.detail(...f.args, result.id);
    expect(detail.amountMinor).toBe("50000000");
    expect(detail.balanceMinor).toBe("50000000");
    expect(detail.dues).toHaveLength(1);
    expect(detail.createdByName).toBe("Test operator");
    expect(await db.purchase.count()).toBe(0);
    expect(await db.productLot.count()).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
    expect(await db.cashMovement.count()).toBe(0);
    expect(
      await db.auditLog.count({
        where: { entityId: result.id, action: "INVOICE_REGISTERED" },
      }),
    ).toBe(1);
  });
  it("persists optional supplier contacts with tenant, permission, audit and stale-edit protection", async () => {
    const f = await fixture();
    const service = new PartiesService(db);
    const input = {
      name: "Renamed supplier",
      phone: "381 444",
      email: "ventas@example.com",
      contactName: "Ana",
      address: "Central 123",
      notes: "Entrega martes",
      accountEnabled: true,
      accountTermDays: 15,
      expectedUpdatedAt: f.supplier.updatedAt.toISOString(),
    };
    await expect(
      service.updateSupplierTerms(f.user.id, f.org.id, f.supplier.id, input),
    ).rejects.toThrow();
    const role = await db.role.findFirstOrThrow({
      where: { organizationId: f.org.id },
    });
    const permission = await db.permission.upsert({
      where: { code: "PARTY_MANAGE" },
      update: {},
      create: { code: "PARTY_MANAGE", description: "Manage suppliers" },
    });
    await db.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    await expect(
      service.updateSupplierTerms(f.user.id, f.org.id, randomUUID(), input),
    ).rejects.toThrow();
    const result = await service.updateSupplierTerms(
      f.user.id,
      f.org.id,
      f.supplier.id,
      input,
    );
    expect(result).toMatchObject({
      name: input.name,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      accountTermDays: 15,
    });
    await expect(
      service.updateSupplierTerms(f.user.id, f.org.id, f.supplier.id, input),
    ).rejects.toThrow("Actualizá");
    const log = await db.auditLog.findFirstOrThrow({
      where: { entityId: f.supplier.id, action: "SUPPLIER_TERMS_UPDATED" },
    });
    expect(log.before).toMatchObject({ name: "Supplier", phone: null });
    expect(log.after).toMatchObject({ name: input.name, phone: input.phone });
    const created = await service.create(
      f.user.id,
      f.org.id,
      "suppliers",
      "New contact",
      undefined,
      undefined,
      {},
      { accountEnabled: false, accountTermDays: null },
      { email: "new@example.com", notes: "Test" },
    );
    expect(created).toMatchObject({ email: "new@example.com", notes: "Test" });
  });
  it("exposes supplier terms to the manual debt editor", async () => {
    const f = await fixture();
    await db.supplier.update({
      where: { id: f.supplier.id },
      data: { accountEnabled: true, accountTermDays: 15 },
    });
    const options = await f.services[0]!.options(...f.args);
    expect(options.suppliers.find((s) => s.id === f.supplier.id)).toMatchObject(
      { accountEnabled: true, accountTermDays: 15 },
    );
  });
  it("allows independent debts without an invented document number and keeps operation deduplication", async () => {
    const f = await fixture();
    const body = {
      ...f.input,
      documentType: "OTRO",
      pointOfSale: "",
      documentNumber: "",
    };
    const a = await f.services[0]!.create(...f.args, body);
    expect((await f.services[1]!.create(...f.args, body)).id).toBe(a.id);
    const b = await f.services[0]!.create(...f.args, {
      ...body,
      operationId: randomUUID(),
    });
    expect(b.id).not.toBe(a.id);
    expect(
      (
        await db.supplierPayableInvoice.findUniqueOrThrow({
          where: { id: a.id },
        })
      ).documentKey,
    ).toBeNull();
  });
  it("handles concurrent duplicate requests and documents without two debts", async () => {
    const f = await fixture();
    const same = await Promise.all(
      f.services.map((s) => s.create(...f.args, f.input)),
    );
    expect(same[0]!.id).toBe(same[1]!.id);
    await expect(
      f.services[0]!.create(...f.args, { ...f.input, notes: "different" }),
    ).rejects.toThrow();
    await expect(
      f.services[0]!.create(...f.args, {
        ...f.input,
        operationId: randomUUID(),
        pointOfSale: "3",
        documentNumber: "1245",
      }),
    ).rejects.toThrow();
    const newDoc = { ...f.input, documentNumber: "777" };
    const concurrent = await Promise.allSettled(
      f.services.map((s) =>
        s.create(...f.args, { ...newDoc, operationId: randomUUID() }),
      ),
    );
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.supplierPayableInvoice.count({
        where: { organizationId: f.org.id },
      }),
    ).toBe(2);
  });
  it("links read-only to existing purchases, allows more than one invoice and preserves estimated values", async () => {
    const f = await fixture();
    const product = await db.product.create({
      data: { organizationId: f.org.id, name: "Test product" },
    });
    const purchase = await db.purchase.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        supplierId: f.supplier.id,
        status: "PARTIALLY_RECEIVED",
        items: {
          create: {
            productId: product.id,
            orderedQuantity: 200,
            receivedQuantity: 100,
            unitCostMinor: 70000,
          },
        },
      },
    });
    const before = await db.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: true },
    });
    const result = await f.services[0]!.create(...f.args, {
      ...f.input,
      purchaseId: purchase.id,
    });
    await f.services[0]!.create(...f.args, {
      ...f.input,
      purchaseId: purchase.id,
      operationId: randomUUID(),
      documentNumber: "00001246",
    });
    const detail = await f.services[0]!.detail(...f.args, result.id);
    expect(detail.purchaseEstimatedMinor).toBe("14000000");
    expect(detail.differenceMinor).toBe("36000000");
    expect(
      await db.purchase.findUnique({
        where: { id: purchase.id },
        include: { items: true },
      }),
    ).toEqual(before);
    expect(await db.inventoryMovement.count()).toBe(0);
    expect(await db.cashMovement.count()).toBe(0);
  });
  it("enforces tenant, branch, supplier and permissions", async () => {
    const f = await fixture(),
      foreign = await fixture();
    await expect(
      f.services[0]!.create(...f.args, {
        ...f.input,
        supplierId: foreign.supplier.id,
      }),
    ).rejects.toThrow();
    const p = await db.purchase.create({
      data: {
        organizationId: foreign.org.id,
        branchId: foreign.branch.id,
        supplierId: foreign.supplier.id,
        status: "RECEIVED",
      },
    });
    await expect(
      f.services[0]!.create(...f.args, { ...f.input, purchaseId: p.id }),
    ).rejects.toThrow();
    const result = await f.services[0]!.create(...f.args, f.input);
    await expect(
      f.services[0]!.detail(...foreign.args, result.id),
    ).rejects.toThrow();
    await expect(
      f.services[0]!.list(f.user.id, f.org.id, foreign.branch.id, {}),
    ).rejects.toThrow();
    await db.rolePermission.deleteMany({
      where: { role: { organizationId: f.org.id } },
    });
    await expect(
      f.services[0]!.create(...f.args, {
        ...f.input,
        operationId: randomUUID(),
        documentNumber: "234",
      }),
    ).rejects.toThrow();
    await expect(f.services[0]!.list(...f.args, {})).rejects.toThrow();
  });
  it("checks schedules, civil dates, and sums only expired installments", async () => {
    const f = await fixture();
    await expect(
      f.services[0]!.create(...f.args, {
        ...f.input,
        dues: [{ dueOn: "2020-01-10", amountMinor: "1" }],
      }),
    ).rejects.toThrow();
    expect(
      await db.supplierPayableInvoice.count({
        where: { organizationId: f.org.id },
      }),
    ).toBe(0);
    await f.services[0]!.create(...f.args, {
      ...f.input,
      dues: [
        { dueOn: "2020-02-01", amountMinor: "20000000" },
        { dueOn: "2099-01-01", amountMinor: "30000000" },
      ],
    });
    const list = await f.services[0]!.list(...f.args, {
      due: "OVERDUE",
      search: "1245",
    });
    expect(list.total).toBe(1);
    expect(list.overdueMinor).toBe("20000000");
    await f.services[0]!.create(...f.args, {
      ...f.input,
      operationId: randomUUID(),
      documentNumber: "22",
      dues: [{ dueOn: null, amountMinor: "50000000" }],
    });
    expect(
      (await f.services[0]!.list(...f.args, { due: "UNDATED" })).total,
    ).toBe(1);
  });
  it("records partial and full payments, allocates oldest dues and removes paid invoices from overdue totals", async () => {
    const f = await fixture();
    const invoice = await f.services[0]!.create(...f.args, {
      ...f.input,
      dues: [
        { dueOn: "2020-03-01", amountMinor: "30000000" },
        { dueOn: "2020-02-01", amountMinor: "20000000" },
      ],
    });
    const body = {
      operationId: randomUUID(),
      amountMinor: "25000000",
      expectedBalanceMinor: "50000000",
      paidOn: "2020-03-02",
      method: "TRANSFER",
      reference: "Test reference",
    };
    const results = await Promise.all(
      f.services.map((s) => s.pay(...f.args, invoice.id, body)),
    );
    expect(results[0]!.id).toBe(results[1]!.id);
    let detail = await f.services[0]!.detail(...f.args, invoice.id);
    expect(detail.paymentStatus).toBe("PARTIAL");
    expect(detail.balanceMinor).toBe("25000000");
    expect(detail.overdueMinor).toBe("25000000");
    expect(detail.dues.map((d) => d.balanceMinor)).toEqual(["25000000", "0"]);
    expect(detail.nextDueOn).toBe("2020-03-01");
    expect(detail.payments).toHaveLength(1);
    await f.services[0]!.pay(...f.args, invoice.id, {
      ...body,
      operationId: randomUUID(),
      expectedBalanceMinor: "25000000",
    });
    detail = await f.services[0]!.detail(...f.args, invoice.id);
    expect(detail.paymentStatus).toBe("PAID");
    expect(detail.balanceMinor).toBe("0");
    expect(detail.overdueMinor).toBe("0");
    expect(
      (await f.services[0]!.list(...f.args, { due: "OVERDUE" })).total,
    ).toBe(0);
    expect(
      (await f.services[0]!.list(...f.args, { payment: "PAID" })).total,
    ).toBe(1);
    expect(
      (await f.services[0]!.list(...f.args, { payment: "OPEN" })).total,
    ).toBe(0);
    expect(await db.cashMovement.count()).toBe(0);
    expect(await db.productLot.count()).toBe(0);
  });
  it("rejects concurrent overpayment and stale balances, preserving the immutable request", async () => {
    const f = await fixture(),
      invoice = await f.services[0]!.create(...f.args, f.input);
    const body = {
      operationId: randomUUID(),
      amountMinor: "30000000",
      expectedBalanceMinor: "50000000",
      paidOn: "2020-03-02",
      method: "CASH",
    };
    const outcomes = await Promise.allSettled(
      f.services.map((s) =>
        s.pay(...f.args, invoice.id, { ...body, operationId: randomUUID() }),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      (await f.services[0]!.detail(...f.args, invoice.id)).balanceMinor,
    ).toBe("20000000");
    await expect(
      f.services[0]!.pay(...f.args, invoice.id, {
        ...body,
        expectedBalanceMinor: "20000000",
      }),
    ).rejects.toThrow();
    const rest = {
      ...body,
      amountMinor: "20000000",
      expectedBalanceMinor: "20000000",
    };
    await f.services[0]!.pay(...f.args, invoice.id, rest);
    await expect(
      f.services[1]!.pay(...f.args, invoice.id, { ...rest, amountMinor: "1" }),
    ).rejects.toThrow();
  });
  it("voids a payment once with audit, restores only its due allocations, and preserves the history", async () => {
    const f = await fixture(),
      invoice = await f.services[0]!.create(...f.args, f.input);
    const body = {
      operationId: randomUUID(),
      amountMinor: "50000000",
      expectedBalanceMinor: "50000000",
      paidOn: "2020-03-02",
      method: "CHECK",
    };
    const p = await f.services[0]!.pay(...f.args, invoice.id, body);
    await expect(
      f.services[0]!.voidPayment(...f.args, invoice.id, p.id, ""),
    ).rejects.toThrow();
    await Promise.all(
      f.services.map((s) =>
        s.voidPayment(...f.args, invoice.id, p.id, "Error de carga"),
      ),
    );
    const detail = await f.services[0]!.detail(...f.args, invoice.id);
    expect(detail.balanceMinor).toBe("50000000");
    expect(detail.paymentStatus).toBe("PENDING");
    expect(detail.payments[0]!.voidReason).toBe("Error de carga");
    expect(
      await db.auditLog.count({
        where: { entityId: p.id, action: "PAYMENT_VOIDED" },
      }),
    ).toBe(1);
    expect((await f.services[0]!.pay(...f.args, invoice.id, body)).id).toBe(
      p.id,
    );
    expect(
      (await f.services[0]!.detail(...f.args, invoice.id)).balanceMinor,
    ).toBe("50000000");
  });
  it("protects payment permissions, scopes and dates and rejects invalid amounts without writes", async () => {
    const f = await fixture(),
      other = await fixture(),
      invoice = await f.services[0]!.create(...f.args, f.input);
    const body = {
      operationId: randomUUID(),
      amountMinor: "10000",
      expectedBalanceMinor: "50000000",
      paidOn: "2020-03-02",
      method: "OTHER",
    };
    await expect(
      other.services[0]!.pay(...other.args, invoice.id, body),
    ).rejects.toThrow();
    for (const change of [
      { amountMinor: "0" },
      { amountMinor: "-1" },
      { paidOn: "2019-01-01" },
      { paidOn: "2099-01-01" },
      { method: "UNKNOWN" },
    ])
      await expect(
        f.services[0]!.pay(...f.args, invoice.id, { ...body, ...change }),
      ).rejects.toThrow();
    await db.rolePermission.deleteMany({
      where: {
        role: { organizationId: f.org.id },
        permission: { code: "PAYABLE_MANAGE" },
      },
    });
    await expect(
      f.services[0]!.pay(...f.args, invoice.id, body),
    ).rejects.toThrow();
    await expect(
      f.services[0]!.voidPayment(
        ...f.args,
        invoice.id,
        randomUUID(),
        "Error de prueba",
      ),
    ).rejects.toThrow();
    expect(
      await db.supplierPayablePayment.count({
        where: { invoiceId: invoice.id },
      }),
    ).toBe(0);
  });
  it("enforces schedule totals and tenant references in the database too", async () => {
    const f = await fixture(),
      foreign = await fixture();
    const result = await f.services[0]!.create(...f.args, f.input);
    await expect(
      db.$transaction((tx) =>
        tx.supplierPayableInvoice.update({
          where: { id: result.id },
          data: { amountMinor: 1n },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      db.supplierPayableInvoice.update({
        where: { id: result.id },
        data: { supplierId: foreign.supplier.id },
      }),
    ).rejects.toThrow();
    expect(
      (await f.services[0]!.detail(...f.args, result.id)).amountMinor,
    ).toBe("50000000");
  });
});
