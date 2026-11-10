import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { PartiesService } from "../src/parties/parties.service";
import { AuditService } from "../src/audit/audit.service";
import type { OperacionCuentaSinConexion } from "../src/accounts/cuenta-sin-conexion";

const MINUTO = 60 * 1000;

// SISTEMA-70: cuenta corriente sin conexión. Lo que se le cobró al cliente es
// definitivo: llega con su hora real, una sola vez, y lo que cambió mientras
// tanto queda como aviso.
describe("cuenta corriente sin conexión (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `offline_accounts_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
        timeout: 90000,
        stdio: "pipe",
      },
    );
    if (result.status !== 0)
      throw new Error("No se pudo preparar el esquema aislado");
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
  }, 100000);
  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^offline_accounts_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function fixture() {
    const org = await db.organization.create({
      data: { name: "Cuentas sin conexión" },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "OFF" },
    });
    const user = await db.user.create({
      data: { email: `${randomUUID()}@example.invalid`, passwordHash: "x" },
    });
    const permissions = await Promise.all(
      ["ACCOUNT_READ", "ACCOUNT_MANAGE", "PARTY_MANAGE", "PARTY_READ"].map(
        (code) =>
          db.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: code },
          }),
      ),
    );
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "CUENTAS",
        name: "Cuentas",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await db.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        displayName: "Ana",
        roles: { create: { roleId: role.id } },
      },
    });
    await db.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        name: "Juana",
        document: "30111222",
        creditEnabled: true,
        creditLimitMinor: 1_000_000n,
      },
    });
    const product = await db.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    const audit = new AuditService(db);
    const accounts = new AccountsService(db, audit);
    const parties = new PartiesService(db);
    const hace = (minutos: number) =>
      new Date(Date.now() - minutos * MINUTO).toISOString();
    /** Venta a cuenta con un renglón por importe (como si fueran lotes). */
    const venta = async (importes: number[], minutos = 300) => {
      const total = importes.reduce((a, b) => a + b, 0);
      const sale = await db.sale.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          customerId: customer.id,
          status: "COMPLETED",
          totalMinor: BigInt(total),
          completedAt: new Date(Date.now() - minutos * MINUTO),
          items: {
            create: importes.map((importe) => ({
              productId: product.id,
              quantity: 1,
              unitPriceMinor: BigInt(importe),
              discountMinor: 0n,
            })),
          },
          payments: {
            create: { method: "ACCOUNT", amountMinor: BigInt(total) },
          },
        },
        include: { items: true },
      });
      await db.customerAccountMovement.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          customerId: customer.id,
          saleId: sale.id,
          type: "DEBIT",
          amountMinor: BigInt(total),
          createdAt: sale.completedAt!,
        },
      });
      return sale;
    };
    type Cuerpo<T extends OperacionCuentaSinConexion["tipo"]> = Extract<
      OperacionCuentaSinConexion,
      { tipo: T }
    >["cuerpo"];
    const op = <T extends OperacionCuentaSinConexion["tipo"]>(
      tipo: T,
      cuerpo: Cuerpo<T>,
      minutos = 30,
      clientOperationId = randomUUID(),
    ) =>
      ({
        tipo,
        clientOperationId,
        occurredAt: hace(minutos),
        deviceId: randomUUID(),
        customerId: customer.id,
        cuerpo,
      }) as OperacionCuentaSinConexion;
    const offline = (operacion: OperacionCuentaSinConexion) =>
      accounts.completeOffline(user.id, org.id, branch.id, operacion);
    const pendiente = async (saleItemId: string) =>
      (await accounts.items(user.id, org.id, customer.id)).items.find(
        (item) => item.saleItemId === saleItemId,
      )!.pendingMinor;
    return {
      org,
      branch,
      user,
      customer,
      product,
      audit,
      accounts,
      parties,
      hace,
      venta,
      op,
      offline,
      pendiente,
    };
  }

  it("cobro imputado sin conexión: hora real, una sola vez y como con conexión", async () => {
    const f = await fixture();
    const sale = await f.venta([1000]);
    const item = sale.items[0]!;
    const cobro = f.op("COBRO", {
      amountMinor: 400,
      method: "TRANSFER",
      imputaciones: [{ saleItemId: item.id, amountMinor: 400 }],
    });
    const primero = await f.offline(cobro);
    expect(primero.offlineIssues).toEqual([]);
    // Reenviar la misma operación no la duplica.
    expect((await f.offline(cobro)).entityId).toBe(primero.entityId);
    const recibos = await db.customerAccountMovement.findMany({
      where: { customerId: f.customer.id, type: "CREDIT" },
    });
    expect(recibos).toHaveLength(1);
    expect(recibos[0]!.createdAt.toISOString()).toBe(cobro.occurredAt);
    expect(await f.pendiente(item.id)).toBe("600");
    // El mismo id con otros datos es un conflicto.
    await expect(
      f.offline({
        ...cobro,
        cuerpo: { ...cobro.cuerpo, amountMinor: 500 },
      } as OperacionCuentaSinConexion),
    ).rejects.toThrow("otros datos");
  });

  it("si otra PC cobró una parte, imputa lo que entra y el resto queda a favor con aviso", async () => {
    const f = await fixture();
    const sale = await f.venta([1000]);
    const item = sale.items[0]!;
    // Mientras esta PC estaba sin conexión, otra cobró 700 con conexión.
    await f.accounts.pay(
      f.user.id,
      f.org.id,
      f.branch.id,
      f.customer.id,
      700,
      "TRANSFER",
      undefined,
      undefined,
      randomUUID(),
      [{ saleItemId: item.id, amountMinor: 700 }],
    );
    const r = await f.offline(
      f.op("COBRO", {
        amountMinor: 1000,
        method: "TRANSFER",
        imputaciones: [{ saleItemId: item.id, amountMinor: 1000 }],
      }),
    );
    expect(r.offlineIssues.map((i) => i.kind).sort()).toEqual([
      "SALDO_A_FAVOR",
      "SALDO_DISTINTO",
    ]);
    expect(await f.pendiente(item.id)).toBe("0");
    const { balanceMinor } = await f.accounts.items(
      f.user.id,
      f.org.id,
      f.customer.id,
    );
    expect(balanceMinor).toBe("-700");
  });

  it("si el precio subió después del cobro, se respeta lo cobrado y no se suma la diferencia", async () => {
    const f = await fixture();
    const sale = await f.venta([1000]);
    const item = sale.items[0]!;
    // Con conexión, otra PC subió la deuda del artículo a 1200.
    await f.accounts.increaseDebt(f.user.id, f.org.id, f.customer.id, item.id, {
      expectedPendingMinor: 1000,
      nextPendingMinor: 1200,
      reason: "Aumento de precio",
      clientOperationId: randomUUID(),
    });
    // Sin conexión, esta PC le cobró el artículo completo a 1000.
    const r = await f.offline(
      f.op("COBRO", {
        amountMinor: 1000,
        method: "CASH",
        imputaciones: [
          {
            saleItemId: item.id,
            amountMinor: 1000,
            expectedPendingMinor: 1000,
            nextPendingMinor: 1000,
          },
        ],
      }),
    );
    expect(r.offlineIssues.map((i) => i.kind)).toContain("SALDO_DISTINTO");
    expect(await f.pendiente(item.id)).toBe("0");
  });

  it("un renglón de una venta hecha sin conexión se reparte entre sus lotes", async () => {
    const f = await fixture();
    const sale = await f.venta([600, 400]);
    await f.offline(
      f.op("COBRO", {
        amountMinor: 800,
        method: "CARD",
        imputaciones: [
          {
            linea: { saleId: sale.id, productId: f.product.id },
            amountMinor: 800,
          },
        ],
      }),
    );
    const pendientes = await Promise.all(
      sale.items.map((item) => f.pendiente(item.id)),
    );
    expect(pendientes.map(Number).reduce((a, b) => a + b, 0)).toBe(200);
  });

  it("efectivo con la caja ya cerrada: el cobro entra y queda en cobros pendientes de caja", async () => {
    const f = await fixture();
    await f.venta([1000]);
    const register = await db.cashRegister.create({
      data: { branchId: f.branch.id, name: "Caja 1" },
    });
    const session = await db.cashSession.create({
      data: {
        cashRegisterId: register.id,
        openedById: f.user.id,
        openingAmountMinor: 0n,
        closedAt: new Date(),
        closingAmountMinor: 0n,
      },
    });
    const r = await f.offline(
      f.op("COBRO", {
        amountMinor: 300,
        method: "CASH",
        cashSessionId: session.id,
      }),
    );
    expect(r.offlineIssues.map((i) => i.kind)).toEqual(["CAJA_CERRADA"]);
    expect(
      await db.cashPendingCollection.count({
        where: { sourceId: r.entityId!, sourceType: "RECEIPT" },
      }),
    ).toBe(1);
    expect(
      await db.cashMovement.count({ where: { cashSessionId: session.id } }),
    ).toBe(0);
  });

  it("si algo falla al final de la transacción, no queda nada y el reintento lo registra una vez", async () => {
    const f = await fixture();
    const sale = await f.venta([1000]);
    const item = sale.items[0]!;
    const cobro = f.op("COBRO", {
      amountMinor: 1000,
      method: "TRANSFER",
      imputaciones: [
        {
          saleItemId: item.id,
          amountMinor: 900,
          expectedPendingMinor: 1000,
          nextPendingMinor: 900,
        },
      ],
    });
    // Falla la auditoría del recibo, después del ajuste y del movimiento.
    const espia = jest
      .spyOn(f.audit, "recordInTransaction")
      .mockImplementation(async (_tx, entry) => {
        if (entry.action === "RECEIPT") throw new Error("falla al terminar");
      });
    await expect(f.offline(cobro)).rejects.toThrow("falla al terminar");
    espia.mockRestore();
    expect(
      await db.customerAccountMovement.count({
        where: { customerId: f.customer.id, saleId: null },
      }),
    ).toBe(0);
    expect(
      await db.customerAccountMovement.count({
        where: { customerId: f.customer.id, saleId: sale.id },
      }),
    ).toBe(1);
    expect(
      await db.offlineOperation.count({
        where: { id: cobro.clientOperationId },
      }),
    ).toBe(0);
    await f.offline(cobro);
    await f.offline(cobro);
    expect(
      await db.customerAccountMovement.count({
        where: { customerId: f.customer.id, saleId: null },
      }),
    ).toBe(1);
    expect(await f.pendiente(item.id)).toBe("0");
  });

  it("aumento de deuda sin conexión con el saldo cambiado: suma la diferencia sobre el saldo de hoy", async () => {
    const f = await fixture();
    const sale = await f.venta([1000]);
    const item = sale.items[0]!;
    await f.accounts.pay(
      f.user.id,
      f.org.id,
      f.branch.id,
      f.customer.id,
      400,
      "TRANSFER",
      undefined,
      undefined,
      randomUUID(),
      [{ saleItemId: item.id, amountMinor: 400 }],
    );
    const r = await f.offline(
      f.op("AUMENTO_DEUDA", {
        destino: { saleItemId: item.id },
        expectedPendingMinor: 1000,
        nextPendingMinor: 1300,
        reason: "Aumento de lista",
      }),
    );
    expect(r.offlineIssues.map((i) => i.kind)).toEqual(["SALDO_DISTINTO"]);
    expect(await f.pendiente(item.id)).toBe("900");
  });

  it("configuración: si otra PC la cambió después, queda la más reciente con aviso", async () => {
    const f = await fixture();
    const vieja = f.op(
      "CONFIGURAR",
      { enabled: true, creditLimitMinor: 50_000, accountTermDays: 30 },
      60,
    );
    // Otra PC con conexión la cambió hace un rato (después de la vieja).
    await f.accounts.configure(
      f.user.id,
      f.org.id,
      f.customer.id,
      true,
      90_000,
      15,
    );
    const r = await f.offline(vieja);
    expect(r.offlineIssues.map((i) => i.kind)).toEqual([
      "CONFIGURACION_PISADA",
    ]);
    const cliente = await db.customer.findUniqueOrThrow({
      where: { id: f.customer.id },
    });
    expect(cliente.creditLimitMinor).toBe(90_000n);
    expect(cliente.accountTermDays).toBe(15);
  });

  it("alta de cliente sin conexión: usa el id de la PC y avisa si repite el DNI", async () => {
    const f = await fixture();
    const clave = randomUUID();
    const alta = {
      clientOperationId: clave,
      occurredAt: f.hace(10),
      deviceId: randomUUID(),
      cuerpo: { name: "Juana bis", document: "30.111.222" },
    };
    const r = await f.parties.createCustomerOffline(
      f.user.id,
      f.org.id,
      f.branch.id,
      alta,
    );
    expect(r.entityId).toBe(clave);
    expect(r.offlineIssues.map((i) => i.kind)).toEqual(["CLIENTE_DUPLICADO"]);
    await f.parties.createCustomerOffline(
      f.user.id,
      f.org.id,
      f.branch.id,
      alta,
    );
    expect(
      await db.customer.count({ where: { organizationId: f.org.id } }),
    ).toBe(2);
  });

  it("edición de cliente sin conexión: aplica la lista y respeta lo que otra PC cambió después", async () => {
    const f = await fixture();
    const lista = await db.priceList.create({
      data: { organizationId: f.org.id, name: "Obra social" },
    });
    const edicion = {
      tipo: "EDICION" as const,
      customerId: f.customer.id,
      clientOperationId: randomUUID(),
      occurredAt: f.hace(30),
      deviceId: randomUUID(),
      cuerpo: { priceListId: lista.id, billingPhone: "3764000000" },
    };
    // Otra PC, con conexión, cambió el teléfono después de esta edición.
    await f.parties.updateBilling(f.user.id, f.org.id, f.customer.id, {
      billingPhone: "3764111111",
    });
    const r = await f.parties.customerOffline(
      f.user.id,
      f.org.id,
      f.branch.id,
      edicion,
    );
    expect(r.offlineIssues.map((i) => i.kind)).toEqual([
      "CONFIGURACION_PISADA",
    ]);
    await f.parties.customerOffline(f.user.id, f.org.id, f.branch.id, edicion);
    const cliente = await db.customer.findUniqueOrThrow({
      where: { id: f.customer.id },
    });
    expect(cliente.priceListId).toBe(lista.id);
    expect(cliente.billingPhone).toBe("3764111111");
  });
});
