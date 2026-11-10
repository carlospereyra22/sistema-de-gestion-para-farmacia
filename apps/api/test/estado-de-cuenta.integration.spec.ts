import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AccountsService } from "../src/accounts/accounts.service";

// SISTEMA-78: el estado de cuenta se pide sólo para lo que se imprime (un
// cliente, desde un día) y el saldo anterior lo calcula la base.
describe("estado de cuenta filtrado (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  let cuentas: AccountsService;
  const schema = `estado_cuenta_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursal = randomUUID();
  const otraSucursal = randomUUID();
  const usuario = randomUUID();
  const juana = randomUUID();
  const pedro = randomUUID();

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Sólo base local de desarrollo");
    url.searchParams.set("schema", schema);
    const result = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 120000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error("No se pudo preparar el esquema aislado");
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
    app = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    cuentas = app.get(AccountsService);
    await db.organization.create({
      data: { id: org, name: "Estado de cuenta" },
    });
    for (const [id, code] of [
      [sucursal, "CEN"],
      [otraSucursal, "NOR"],
    ] as const)
      await db.branch.create({
        data: { id, organizationId: org, name: code, code },
      });
    await db.user.create({
      data: {
        id: usuario,
        email: `${usuario}@example.invalid`,
        passwordHash: "x",
      },
    });
    const permiso = await db.permission.upsert({
      where: { code: "ACCOUNT_READ" },
      update: {},
      create: { code: "ACCOUNT_READ", description: "ACCOUNT_READ" },
    });
    const rol = await db.role.create({
      data: {
        organizationId: org,
        code: "CUENTAS",
        name: "Cuentas",
        permissions: { create: [{ permissionId: permiso.id }] },
      },
    });
    await db.userOrganization.create({
      data: {
        organizationId: org,
        userId: usuario,
        roles: { create: { roleId: rol.id } },
      },
    });
    await db.userBranch.create({
      data: { userId: usuario, branchId: sucursal },
    });
    for (const [id, name] of [
      [juana, "Juana"],
      [pedro, "Pedro"],
    ] as const)
      await db.customer.create({ data: { id, organizationId: org, name } });
    const movimiento = (
      customerId: string,
      type: "DEBIT" | "CREDIT",
      amountMinor: bigint,
      fecha: string,
      branchId = sucursal,
    ) =>
      db.customerAccountMovement.create({
        data: {
          organizationId: org,
          branchId,
          customerId,
          type,
          amountMinor,
          // Mediodía de Argentina.
          createdAt: new Date(`${fecha}T15:00:00.000Z`),
        },
      });
    await movimiento(juana, "DEBIT", 1000n, "2026-01-10");
    await movimiento(juana, "CREDIT", 300n, "2026-02-10");
    await movimiento(juana, "DEBIT", 500n, "2026-03-10");
    await movimiento(juana, "DEBIT", 9999n, "2026-01-05", otraSucursal);
    await movimiento(pedro, "DEBIT", 200n, "2026-03-15");
  }, 300000);

  afterAll(async () => {
    if (/^estado_cuenta_[a-f0-9]{32}$/.test(schema))
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  it("sin filtros, todos los clientes con todos los movimientos de la sucursal", async () => {
    const estado = await cuentas.statement(usuario, org, sucursal);
    expect(estado.map((c) => c.name)).toEqual(["Juana", "Pedro"]);
    const deJuana = estado[0]!;
    expect(deJuana.openingBalanceMinor).toBe("0");
    expect(deJuana.movements.map((m) => m.balanceMinor)).toEqual([
      "1000",
      "700",
      "1200",
    ]);
  });

  it("con cliente y desde: sólo ese cliente, desde ese día y con el saldo anterior", async () => {
    const estado = await cuentas.statement(usuario, org, sucursal, {
      customerId: juana,
      desde: "2026-02-10",
    });
    expect(estado).toHaveLength(1);
    expect(estado[0]).toMatchObject({
      id: juana,
      // Sólo la sucursal: la deuda de la otra no cuenta.
      openingBalanceMinor: "1000",
    });
    expect(
      estado[0]!.movements.map((m) => [m.amountMinor, m.balanceMinor]),
    ).toEqual([
      ["300", "700"],
      ["500", "1200"],
    ]);
    // Un cliente sin movimientos desde ese día: su saldo anterior.
    const pedroDespues = await cuentas.statement(usuario, org, sucursal, {
      customerId: pedro,
      desde: "2026-04-01",
    });
    expect(pedroDespues[0]).toMatchObject({
      openingBalanceMinor: "200",
      movements: [],
    });
  });

  it("los movimientos de un cliente traen la sucursal y si van en el resumen", async () => {
    const movimientos = await cuentas.movements(usuario, org, juana);
    expect(movimientos.map((m) => m.branchId).sort()).toEqual(
      [sucursal, sucursal, sucursal, otraSucursal].sort(),
    );
    expect(
      movimientos.every((m) => typeof m.showInStatement === "boolean"),
    ).toBe(true);
  });

  it("rechaza una fecha inválida y no muestra otras sucursales", async () => {
    await expect(
      cuentas.statement(usuario, org, sucursal, { desde: "2026-02-31" }),
    ).rejects.toThrow("fechas");
    await expect(cuentas.statement(usuario, org, otraSucursal)).rejects.toThrow(
      "sucursal",
    );
  });
});
