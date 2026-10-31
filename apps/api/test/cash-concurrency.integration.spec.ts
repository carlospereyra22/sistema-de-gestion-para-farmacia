import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { CashService } from "../src/cash/cash.service";
import { AuditService } from "../src/audit/audit.service";

describe("cash concurrency on an isolated synthetic schema", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `cash_concurrency_${randomUUID().replaceAll("-", "")}`;
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
    if (app && /^cash_concurrency_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });
  async function fixture() {
    const org = await first.organization.create({
      data: { name: "Synthetic cash test" },
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
      ["CASH_READ", "CASH_MANAGE"].map((code) =>
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
        displayName: "Test cashier",
        roles: { create: { roleId: role.id } },
      },
    });
    const register = await first.cashRegister.create({
      data: { branchId: branch.id, name: "Test" },
    });
    const services = [first, second].map(
      (db) => new CashService(db, new AuditService(db)),
    );
    const args = [user.id, org.id, branch.id] as const;
    const open = () =>
      services[0]!.open(...args, {
        cashRegisterId: register.id,
        openingAmountMinor: 10000,
      });
    return { org, branch, user, register, services, args, open };
  }
  it("stores an editable responsible and snapshots it without replacing the closing actor", async () => {
    const f = await fixture();
    const service = f.services[0]!;
    const register = await service.createRegister(
      ...f.args,
      "Responsible test",
      undefined,
      "  Ana Pérez  ",
    );
    expect(register.responsibleName).toBe("Ana Pérez");
    const session = await service.open(...f.args, {
      cashRegisterId: register.id,
      openingAmountMinor: 0,
    });
    await service.close(...f.args, session.id, {
      closingAmountMinor: 0,
      expectedAmountMinor: 0,
    });
    await service.editRegister(...f.args, register.id, {
      name: register.name,
      active: true,
      expectedName: register.name,
      expectedActive: true,
      responsibleName: "Juan López",
      expectedResponsibleName: "Ana Pérez",
    });
    const detail = await service.closureDetail(...f.args, session.id);
    expect(detail.registerResponsibleName).toBe("Ana Pérez");
    expect(detail.closedBy).toBe("Test cashier");
    await expect(
      service.editRegister(...f.args, register.id, {
        name: register.name,
        active: true,
        expectedName: register.name,
        expectedActive: true,
        responsibleName: "Otro nombre",
        expectedResponsibleName: "Ana Pérez",
      }),
    ).rejects.toThrow();
    await expect(
      service.createRegister(...f.args, "Invalid responsible", undefined, "A"),
    ).rejects.toThrow("responsable");
  });
  it("serializes two openings of the same register", async () => {
    const f = await fixture();
    const results = await Promise.allSettled(
      f.services.map((service) =>
        service.open(...f.args, {
          cashRegisterId: f.register.id,
          openingAmountMinor: 10000,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await first.cashSession.count({
        where: { cashRegisterId: f.register.id, closedAt: null },
      }),
    ).toBe(1);
  });
  it("serializes double close and records one closing audit", async () => {
    const f = await fixture();
    const session = await f.open();
    const results = await Promise.allSettled(
      f.services.map((service) =>
        service.close(...f.args, session.id, {
          closingAmountMinor: 10000,
          expectedAmountMinor: 10000,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await first.auditLog.count({
        where: { entityId: session.id, action: "CLOSED" },
      }),
    ).toBe(1);
  });
  it("deduplicates simultaneous manual requests", async () => {
    const f = await fixture();
    const session = await f.open();
    const input = {
      type: "IN" as const,
      amountMinor: 2000,
      reason: "Synthetic test",
      clientOperationId: randomUUID(),
    };
    await Promise.all(
      f.services.map((service) =>
        service.movement(...f.args, session.id, input),
      ),
    );
    expect(
      await first.cashMovement.count({ where: { cashSessionId: session.id } }),
    ).toBe(1);
  });
  it("never accepts both a stale close and a concurrent movement", async () => {
    const f = await fixture();
    const session = await f.open();
    const results = await Promise.allSettled([
      f.services[0]!.close(...f.args, session.id, {
        closingAmountMinor: 10000,
        expectedAmountMinor: 10000,
      }),
      f.services[1]!.movement(...f.args, session.id, {
        type: "IN",
        amountMinor: 2000,
        reason: "Concurrent receipt",
        clientOperationId: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await first.cashSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(
      await first.cashMovement.count({ where: { cashSessionId: session.id } }),
    ).toBe(current.closedAt ? 0 : 1);
  });
  async function pending(f: Awaited<ReturnType<typeof fixture>>) {
    const sale = await first.sale.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        status: "COMPLETED",
        totalMinor: 5000,
      },
    });
    return first.cashPendingCollection.create({
      data: {
        organizationId: f.org.id,
        branchId: f.branch.id,
        actorId: f.user.id,
        sourceType: "SALE",
        sourceId: sale.id,
        cashMinor: 3000,
        cardMinor: 2000,
        transferMinor: 0,
      },
    });
  }
  it("incorporates a pending mixed receipt only once under concurrent requests", async () => {
    const f = await fixture();
    const session = await f.open();
    const row = await pending(f);
    await Promise.all(
      f.services.map((service) =>
        service.assignCollection(...f.args, row.id, session.id),
      ),
    );
    const movements = await first.cashMovement.findMany({
      where: { cashSessionId: session.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.amountMinor).toBe(3000n);
    expect(
      await first.auditLog.count({
        where: { entityId: row.id, action: "ASSIGNED" },
      }),
    ).toBe(1);
  });
  it("does not incorporate pending cash into a concurrently closed session", async () => {
    const f = await fixture();
    const session = await f.open();
    const row = await pending(f);
    const results = await Promise.allSettled([
      f.services[0]!.close(...f.args, session.id, {
        closingAmountMinor: 10000,
        expectedAmountMinor: 10000,
      }),
      f.services[1]!.assignCollection(...f.args, row.id, session.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await first.cashSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    const receipt = await first.cashPendingCollection.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(Boolean(receipt.assignedAt)).toBe(!current.closedAt);
  });
  it("returns old open sessions even after twenty newer closures, and scopes the latest closure", async () => {
    const f = await fixture();
    const session = await f.open();
    const other = await first.cashRegister.create({
      data: { branchId: f.branch.id, name: "Other" },
    });
    await first.cashSession.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        cashRegisterId: other.id,
        openedById: f.user.id,
        openingAmountMinor: 0,
        closingAmountMinor: 0,
        openedAt: new Date(Date.now() + i * 1000),
        closedAt: new Date(Date.now() + i * 1000 + 500),
      })),
    });
    const listed = await f.services[0]!.list(...f.args);
    expect(
      listed.sessions.find((s) => s.id === session.id)?.closedAt,
    ).toBeNull();
    expect(listed.sessions).toHaveLength(21);
    expect(
      await f.services[0]!.closures(
        ...f.args,
        undefined,
        undefined,
        false,
        f.register.id,
        1,
      ),
    ).toEqual([]);
    await f.services[0]!.close(...f.args, session.id, {
      closingAmountMinor: 10000,
    });
    const latest = await f.services[0]!.closures(
      ...f.args,
      undefined,
      undefined,
      false,
      f.register.id,
      1,
    );
    expect(latest).toHaveLength(1);
    expect(latest[0]!.id).toBe(session.id);
    expect(latest[0]!.closedBy).toBe("Test cashier");
    await first.cashSession.update({
      where: { id: session.id },
      data: { closedAt: new Date("2020-01-01") },
    });
    expect(
      (
        await f.services[0]!.closures(
          ...f.args,
          undefined,
          undefined,
          false,
          f.register.id,
          1,
        )
      )[0]!.id,
    ).toBe(session.id);
    expect(
      await f.services[0]!.closures(
        ...f.args,
        undefined,
        undefined,
        false,
        randomUUID(),
        1,
      ),
    ).toEqual([]);
    await first.cashSession.update({
      where: { id: session.id },
      data: { archivedAt: new Date() },
    });
    expect(
      await f.services[0]!.closures(
        ...f.args,
        undefined,
        undefined,
        false,
        f.register.id,
        1,
      ),
    ).toEqual([]);
  });
});
