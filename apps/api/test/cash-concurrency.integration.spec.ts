import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { CashService } from "../src/cash/cash.service";
import { findOwnOpenSession } from "../src/cash/own-open-session";
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
  describe("quitar la caja de un cobro pendiente", () => {
    async function pendingFixture() {
      const f = await fixture();
      const pending = await first.cashPendingCollection.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          sourceType: "RECEIPT",
          sourceId: randomUUID(),
          actorId: f.user.id,
          cashMinor: 5000n,
          cardMinor: 0n,
          transferMinor: 0n,
        },
      });
      const service = f.services[0]!;
      await service.setCollectionDestination(
        ...f.args,
        pending.id,
        f.register.id,
      );
      const clear = (expected = f.register.id) =>
        service.clearCollectionDestination(...f.args, pending.id, expected);
      return { ...f, pending, service, clear };
    }
    const reload = (id: string) =>
      first.cashPendingCollection.findUniqueOrThrow({ where: { id } });

    it("informa qué usuario hizo el cobro", async () => {
      const f = await pendingFixture();
      const rows = await f.service.pendingCollections(...f.args);
      expect(rows[0]?.collectedBy).toBe("Test cashier");
    });
    it("deja el cobro sin caja, sin mover dinero y con auditoría", async () => {
      const f = await pendingFixture();
      const session = await f.open();
      await f.clear();
      expect(await reload(f.pending.id)).toMatchObject({
        destinationRegisterId: null,
        destinationSetAt: null,
        destinationSetById: null,
        assignedAt: null,
      });
      expect(
        await first.cashMovement.count({
          where: { cashSessionId: session.id },
        }),
      ).toBe(0);
      const audit = await first.auditLog.findFirstOrThrow({
        where: { entityId: f.pending.id, action: "DESTINATION_CLEARED" },
      });
      expect(audit.actorId).toBe(f.user.id);
      expect(audit.before).toMatchObject({ cashRegisterId: f.register.id });
    });
    it("permite asignar otra caja después de quitarla", async () => {
      const f = await pendingFixture();
      const other = await first.cashRegister.create({
        data: { branchId: f.branch.id, name: "Otra" },
      });
      await f.clear();
      await f.service.setCollectionDestination(
        ...f.args,
        f.pending.id,
        other.id,
      );
      expect((await reload(f.pending.id)).destinationRegisterId).toBe(other.id);
    });
    it("un reintento no falla ni audita dos veces", async () => {
      const f = await pendingFixture();
      await f.clear();
      await expect(f.clear()).resolves.toMatchObject({
        destinationRegisterId: null,
      });
      expect(
        await first.auditLog.count({
          where: { entityId: f.pending.id, action: "DESTINATION_CLEARED" },
        }),
      ).toBe(1);
    });
    it("rechaza quitarla si el cobro cambió de caja", async () => {
      const f = await pendingFixture();
      await expect(f.clear(randomUUID())).rejects.toThrow("cambió de caja");
      expect((await reload(f.pending.id)).destinationRegisterId).toBe(
        f.register.id,
      );
    });
    it("rechaza quitarla si el cobro ya se incorporó a una sesión", async () => {
      const f = await pendingFixture();
      const session = await f.open();
      await f.service.assignCollection(...f.args, f.pending.id, session.id);
      await expect(f.clear()).rejects.toThrow("ya se incorporó");
      expect((await reload(f.pending.id)).destinationRegisterId).toBe(
        f.register.id,
      );
    });
    it("no alcanza cobros de otra sucursal", async () => {
      const f = await pendingFixture();
      const norte = await first.branch.create({
        data: { organizationId: f.org.id, name: "Norte", code: "NORTE" },
      });
      await first.userBranch.create({
        data: { userId: f.user.id, branchId: norte.id },
      });
      await expect(
        f.service.clearCollectionDestination(
          f.user.id,
          f.org.id,
          norte.id,
          f.pending.id,
          f.register.id,
        ),
      ).rejects.toThrow("no disponible");
    });
  });
  describe("cajas de la organización", () => {
    it("lista quién abrió cada caja, con el email si no tiene nombre", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      await first.userOrganization.update({
        where: {
          userId_organizationId: {
            userId: f.user.id,
            organizationId: f.org.id,
          },
        },
        data: { displayName: null },
      });
      const email = (
        await first.user.findUniqueOrThrow({ where: { id: f.user.id } })
      ).email;
      await first.userBranch.create({
        data: { userId: f.user.id, branchId: f.branch.id },
      });
      await f.open();
      const closed = await first.cashRegister.create({
        data: { branchId: f.branch.id, name: "Zeta" },
      });
      const { registers } = await service.organizationRegisters(
        f.user.id,
        f.org.id,
      );
      expect(registers.map((row) => row.name)).toEqual(["Test", "Zeta"]);
      expect(registers[0]!.session?.openedBy).toBe(email);
      expect(registers.find((row) => row.id === closed.id)?.session).toBeNull();
      const { sessions } = await service.list(...f.args);
      expect(sessions[0]!.openedBy).toBe(email);
    });
    it("sólo muestra las sucursales asignadas al usuario", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      const norte = await first.branch.create({
        data: { organizationId: f.org.id, name: "Norte", code: "NORTE" },
      });
      await first.cashRegister.create({
        data: { branchId: norte.id, name: "Ajena" },
      });
      await first.userBranch.create({
        data: { userId: f.user.id, branchId: f.branch.id },
      });
      const result = await service.organizationRegisters(f.user.id, f.org.id);
      expect(result.branches.map((row) => row.id)).toEqual([f.branch.id]);
      expect(result.registers.map((row) => row.name)).toEqual(["Test"]);
    });
    it("no da acceso a un usuario de otra organización", async () => {
      const f = await fixture();
      const ajena = await fixture();
      await expect(
        f.services[0]!.organizationRegisters(ajena.user.id, f.org.id),
      ).rejects.toThrow();
    });
  });
  describe("una caja abierta por usuario", () => {
    const openOn = (
      service: CashService,
      args: readonly [string, string, string],
      cashRegisterId: string,
    ) => service.open(...args, { cashRegisterId, openingAmountMinor: 0 });
    async function secondRegister(branchId: string) {
      return first.cashRegister.create({
        data: { branchId, name: `Caja ${randomUUID()}` },
      });
    }
    async function secondUser(organizationId: string, branchId: string) {
      const user = await first.user.create({
        data: {
          email: randomUUID() + "@example.invalid",
          passwordHash: "fixture",
        },
      });
      const role = await first.role.findFirstOrThrow({
        where: { organizationId },
      });
      await first.userOrganization.create({
        data: {
          organizationId,
          userId: user.id,
          displayName: "Segundo cajero",
          roles: { create: { roleId: role.id } },
        },
      });
      return [user.id, organizationId, branchId] as const;
    }

    it("permite dos usuarios con cajas abiertas en sucursales distintas", async () => {
      const f = await fixture();
      const norte = await first.branch.create({
        data: { organizationId: f.org.id, name: "Norte", code: "NORTE" },
      });
      const other = await secondRegister(norte.id);
      const segundo = await secondUser(f.org.id, norte.id);
      await f.open();
      await expect(
        openOn(f.services[0]!, segundo, other.id),
      ).resolves.toBeDefined();
    });
    it("serializa dos aperturas del mismo usuario en cajas distintas", async () => {
      const f = await fixture();
      const other = await secondRegister(f.branch.id);
      const results = await Promise.allSettled([
        openOn(f.services[0]!, f.args, f.register.id),
        openOn(f.services[1]!, f.args, other.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await first.cashSession.count({
          where: { openedById: f.user.id, closedAt: null },
        }),
      ).toBe(1);
    });
    it("una apertura espera a que termine la otra del mismo usuario", async () => {
      const f = await fixture();
      const other = await secondRegister(f.branch.id);
      let release = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      let markLocked = () => {};
      const locked = new Promise<void>((resolve) => (markLocked = resolve));
      // Mantiene la primera apertura sin confirmar: sin bloqueo, la segunda
      // no vería esta sesión y abriría una caja de más.
      const holder = first.$transaction(
        async (tx) => {
          await findOwnOpenSession(tx, f.user.id, f.org.id);
          await tx.cashSession.create({
            data: {
              cashRegisterId: f.register.id,
              openedById: f.user.id,
              openingAmountMinor: 0n,
            },
          });
          markLocked();
          await gate;
        },
        { timeout: 20000 },
      );
      await locked;
      const attempt = openOn(f.services[1]!, f.args, other.id).then(
        () => "abrió",
        (cause: Error) => cause.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      release();
      await holder;
      await expect(attempt).resolves.toContain("Ya tenés abierta");
    });
    it("rechaza una segunda caja y la permite después de cerrar", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      const other = await secondRegister(f.branch.id);
      const session = await f.open();
      await expect(openOn(service, f.args, other.id)).rejects.toThrow(
        "Ya tenés abierta Test en Test",
      );
      await service.close(...f.args, session.id, {
        closingAmountMinor: 10000,
        expectedAmountMinor: 10000,
      });
      await expect(openOn(service, f.args, other.id)).resolves.toBeDefined();
    });
    it("también rechaza una caja de otra sucursal de la organización", async () => {
      const f = await fixture();
      const norte = await first.branch.create({
        data: { organizationId: f.org.id, name: "Norte", code: "NORTE" },
      });
      await first.userBranch.create({
        data: { userId: f.user.id, branchId: norte.id },
      });
      const other = await secondRegister(norte.id);
      await f.open();
      await expect(
        openOn(f.services[0]!, [f.user.id, f.org.id, norte.id], other.id),
      ).rejects.toThrow("Ya tenés abierta Test en Test");
    });
    it("no cuenta las sesiones cerradas ni las de otra organización", async () => {
      const f = await fixture();
      const session = await f.open();
      await f.services[0]!.close(...f.args, session.id, {
        closingAmountMinor: 10000,
        expectedAmountMinor: 10000,
      });
      const ajena = await fixture();
      await first.userOrganization.create({
        data: { organizationId: ajena.org.id, userId: f.user.id },
      });
      await ajena.open();
      await expect(f.open()).resolves.toBeDefined();
    });
    it("deja operar las sesiones que ya estaban abiertas de más", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      const other = await secondRegister(f.branch.id);
      const session = await f.open();
      const previa = await first.cashSession.create({
        data: {
          cashRegisterId: other.id,
          openedById: f.user.id,
          openingAmountMinor: 0n,
        },
      });
      await service.close(...f.args, previa.id, {
        closingAmountMinor: 0,
        expectedAmountMinor: 0,
      });
      await service.close(...f.args, session.id, {
        closingAmountMinor: 10000,
        expectedAmountMinor: 10000,
      });
      expect(
        await first.cashSession.count({
          where: { openedById: f.user.id, closedAt: null },
        }),
      ).toBe(0);
    });
    it("permite dos usuarios con cajas abiertas e informa cuál es propia", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      const other = await secondRegister(f.branch.id);
      const segundo = await secondUser(f.org.id, f.branch.id);
      const session = await f.open();
      const ajena = await openOn(service, segundo, other.id);
      const { sessions } = await service.list(...f.args);
      const propia = (id: string) =>
        sessions.find((row) => row.id === id)?.openedByCurrentUser;
      expect(propia(session.id)).toBe(true);
      expect(propia(ajena.id)).toBe(false);
    });
    it("permite que otro usuario opere la caja ajena", async () => {
      const f = await fixture();
      const service = f.services[0]!;
      const segundo = await secondUser(f.org.id, f.branch.id);
      await first.userBranch.create({
        data: { userId: segundo[0], branchId: f.branch.id },
      });
      const session = await f.open();
      await service.movement(...segundo, session.id, {
        type: "IN",
        amountMinor: 100,
        reason: "Cambio",
        clientOperationId: randomUUID(),
      });
      await service.close(...segundo, session.id, {
        closingAmountMinor: 10100,
        expectedAmountMinor: 10100,
      });
      expect(
        await first.cashMovement.count({
          where: { cashSessionId: session.id, actorId: segundo[0] },
        }),
      ).toBe(1);
    });
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
  it("dos egresos simultáneos no superan juntos el efectivo", async () => {
    const f = await fixture();
    const session = await f.open();
    const results = await Promise.allSettled(
      f.services.map((service) =>
        service.movement(...f.args, session.id, {
          type: "OUT",
          amountMinor: 7000,
          reason: "Retiro simultáneo",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
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
