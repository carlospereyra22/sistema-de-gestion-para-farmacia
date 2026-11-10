import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CashService } from "../src/cash/cash.service";
import { SalesService } from "../src/sales/sales.service";
import type { OperacionCajaSinConexion } from "../src/cash/offline-cash";
import { dentroDeLaTransaccion } from "./support/arca-simulada";

const MINUTO = 60 * 1000;

// SISTEMA-67: caja sin conexión. Apertura, ventas, movimientos y cierre hechos
// sin internet llegan después, en orden, con su hora real.
describe("caja sin conexión (base local con rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Sólo base local de desarrollo");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function enRollback(
    caso: (
      tx: Prisma.TransactionClient,
      f: Awaited<ReturnType<typeof fixture>>,
    ) => Promise<void>,
  ) {
    const rollback = new Error("ROLLBACK_CAJA_SIN_CONEXION");
    await expect(
      prisma.$transaction(
        async (tx) => {
          await caso(tx, await fixture(tx));
          throw rollback;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(rollback);
  }

  async function fixture(tx: Prisma.TransactionClient) {
    const org = await tx.organization.create({
      data: { name: "Farmacia caja sin conexión" },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Central", code: "CSC" },
    });
    const usuario = async () => {
      const user = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          passwordHash: "not-a-secret",
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
      return user;
    };
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: ["SALE_MANAGE", "SALE_READ", "CASH_READ", "CASH_MANAGE"] },
      },
    });
    const role = await tx.role.create({
      data: {
        organizationId: org.id,
        name: "Cajero",
        code: "CSC",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    const ana = await usuario();
    const beto = await usuario();
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Mostrador" },
    });
    const product = await tx.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    const priceList = await tx.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    await tx.productPrice.create({
      data: {
        productId: product.id,
        priceListId: priceList.id,
        amountMinor: 10000n,
      },
    });
    await tx.productLot.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        productId: product.id,
        number: "L1",
        quantity: 10,
        unitCostMinor: 4000n,
      },
    });
    const scoped = dentroDeLaTransaccion(tx);
    const audit = new AuditService(scoped);
    const cash = new CashService(scoped, audit);
    const sales = new SalesService(scoped, audit);
    const deviceId = randomUUID();
    const hace = (minutos: number) =>
      new Date(Date.now() - minutos * MINUTO).toISOString();
    const caja = (
      usuarioId: string,
      op: Omit<OperacionCajaSinConexion, "clientOperationId" | "deviceId"> & {
        clientOperationId?: string;
      },
    ) =>
      cash.completeOffline(usuarioId, org.id, branch.id, {
        clientOperationId: randomUUID(),
        deviceId,
        ...op,
      });
    const vender = (sessionId: string, minutos: number) =>
      sales.completeOffline(ana.id, org.id, branch.id, {
        clientOperationId: randomUUID(),
        occurredAt: hace(minutos),
        deviceId,
        items: [
          {
            productId: product.id,
            quantity: 1,
            discountMinor: 0,
            expectedUnitPriceMinor: "10000",
            productName: "Ibuprofeno 400",
          },
        ],
        payments: [
          { method: "CASH", amountMinor: 10000, cashSessionId: sessionId },
        ],
      });
    // Cobro de un recibo sin caja (SISTEMA-81).
    const cobro = (cashMinor = 5000n) =>
      tx.cashPendingCollection.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          sourceType: "RECEIPT",
          sourceId: randomUUID(),
          actorId: ana.id,
          cashMinor,
          cardMinor: 0n,
          transferMinor: 0n,
        },
      });
    return {
      org,
      branch,
      ana,
      beto,
      register,
      cash,
      caja,
      vender,
      hace,
      cobro,
    };
  }

  it("abre, vende, mueve y cierra sin conexión, con la hora real y sin duplicar", () =>
    enRollback(async (tx, f) => {
      const aperturaId = randomUUID();
      const apertura = {
        tipo: "APERTURA" as const,
        clientOperationId: aperturaId,
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 50000,
      };
      const abierta = await f.caja(f.ana.id, apertura);
      expect(abierta).toMatchObject({
        entityId: aperturaId,
        offlineIssues: [],
      });
      const sesion = await tx.cashSession.findUniqueOrThrow({
        where: { id: aperturaId },
      });
      expect(sesion.openedAt.toISOString()).toBe(apertura.occurredAt);

      // La venta usa el id de la apertura hecha en la PC.
      await f.vender(aperturaId, 50);
      await f.caja(f.ana.id, {
        tipo: "MOVIMIENTO",
        occurredAt: f.hace(40),
        sessionId: aperturaId,
        type: "OUT",
        amountMinor: 20000,
        reason: "Pago de flete",
      });
      // Esperado: 500 de fondo + 100 de la venta - 200 del egreso.
      const cierre = await f.caja(f.ana.id, {
        tipo: "CIERRE",
        occurredAt: f.hace(30),
        sessionId: aperturaId,
        closingAmountMinor: 40000,
        expectedAmountMinor: 40000,
      });
      expect(cierre.offlineIssues).toEqual([]);
      const cerrada = await tx.cashSession.findUniqueOrThrow({
        where: { id: aperturaId },
      });
      expect(cerrada.closingAmountMinor).toBe(40000n);
      // Se cerró a la hora en que pasó, no al llegar.
      expect(Date.now() - cerrada.closedAt!.getTime()).toBeGreaterThan(
        25 * MINUTO,
      );

      // Reenviar la apertura no abre otra caja.
      await f.caja(f.ana.id, apertura);
      expect(
        await tx.cashSession.count({
          where: { cashRegisterId: f.register.id },
        }),
      ).toBe(1);
      await expect(
        f.caja(f.ana.id, { ...apertura, openingAmountMinor: 1 }),
      ).rejects.toThrow("otros datos");
    }));

  it("si otra PC abrió la caja mientras tanto, todo se suma a esa sesión con aviso", () =>
    enRollback(async (tx, f) => {
      const otra = await tx.cashSession.create({
        data: {
          cashRegisterId: f.register.id,
          openedById: f.beto.id,
          openingAmountMinor: 0n,
          openedAt: new Date(Date.now() - 90 * MINUTO),
        },
      });
      const aperturaId = randomUUID();
      const abierta = await f.caja(f.ana.id, {
        tipo: "APERTURA",
        clientOperationId: aperturaId,
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 0,
      });
      expect(abierta.entityId).toBe(otra.id);
      expect(abierta.offlineIssues.map((aviso) => aviso.kind)).toEqual([
        "CAJA_YA_ABIERTA",
      ]);
      const venta = await f.vender(aperturaId, 50);
      expect(venta.offlineIssues).toEqual([]);
      expect(
        await tx.salePayment.findFirstOrThrow({ where: { saleId: venta.id } }),
      ).toMatchObject({ cashSessionId: otra.id });
    }));

  it("cierre con otro esperado, egreso de más y movimiento con la caja ya cerrada: avisos", () =>
    enRollback(async (tx, f) => {
      const aperturaId = randomUUID();
      await f.caja(f.ana.id, {
        tipo: "APERTURA",
        clientOperationId: aperturaId,
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 10000,
      });
      const egreso = await f.caja(f.ana.id, {
        tipo: "MOVIMIENTO",
        occurredAt: f.hace(50),
        sessionId: aperturaId,
        type: "OUT",
        amountMinor: 30000,
        reason: "Retiro",
      });
      expect(egreso.offlineIssues.map((aviso) => aviso.kind)).toEqual([
        "EGRESO_SUPERA_EFECTIVO",
      ]);
      const cierre = await f.caja(f.ana.id, {
        tipo: "CIERRE",
        occurredAt: f.hace(40),
        sessionId: aperturaId,
        closingAmountMinor: 0,
        expectedAmountMinor: 10000,
      });
      expect(cierre.offlineIssues.map((aviso) => aviso.kind)).toEqual([
        "CIERRE_DISTINTO",
      ]);
      const tarde = await f.caja(f.ana.id, {
        tipo: "MOVIMIENTO",
        occurredAt: f.hace(30),
        sessionId: aperturaId,
        type: "IN",
        amountMinor: 5000,
        reason: "Cambio",
      });
      expect(tarde.offlineIssues.map((aviso) => aviso.kind)).toEqual([
        "MOVIMIENTO_RETENIDO",
      ]);
      expect(
        await tx.cashMovement.count({ where: { cashSessionId: aperturaId } }),
      ).toBe(1);
    }));

  it("si la venta llegó antes que la apertura de su caja, al llegar la apertura pasa a esa caja", () =>
    enRollback(async (tx, f) => {
      const aperturaId = randomUUID();
      // Llega primero la venta: su caja todavía no existe.
      const venta = await f.vender(aperturaId, 50);
      expect(venta.offlineIssues.map((aviso) => aviso.kind)).toEqual([
        "CAJA_CERRADA",
      ]);
      await f.caja(f.ana.id, {
        tipo: "APERTURA",
        clientOperationId: aperturaId,
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 10000,
      });
      expect(
        await tx.salePayment.findFirstOrThrow({ where: { saleId: venta.id } }),
      ).toMatchObject({ cashSessionId: aperturaId });
      expect(
        await tx.offlineSyncIssue.findFirstOrThrow({
          where: { saleId: venta.id },
        }),
      ).toMatchObject({ status: "RESOLVED" });
      // Cuenta como venta de esa caja: 100 de fondo + 100 de la venta.
      const cierre = await f.caja(f.ana.id, {
        tipo: "CIERRE",
        occurredAt: f.hace(30),
        sessionId: aperturaId,
        closingAmountMinor: 20000,
        expectedAmountMinor: 20000,
      });
      expect(cierre.offlineIssues).toEqual([]);
    }));

  // --- Cobros pendientes sin conexión (SISTEMA-81) ---

  it("asigna la caja e incorpora un cobro pendiente sin conexión, en una caja abierta sin conexión", () =>
    enRollback(async (tx, f) => {
      const pendiente = await f.cobro();
      const aperturaId = randomUUID();
      await f.caja(f.ana.id, {
        tipo: "APERTURA",
        clientOperationId: aperturaId,
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 10000,
      });
      await f.caja(f.ana.id, {
        tipo: "COBRO_DESTINO",
        occurredAt: f.hace(50),
        collectionId: pendiente.id,
        cashRegisterId: f.register.id,
      });
      const incorporar = {
        tipo: "COBRO_INCORPORAR" as const,
        clientOperationId: randomUUID(),
        occurredAt: f.hace(40),
        collectionId: pendiente.id,
        sessionId: aperturaId,
      };
      const r = await f.caja(f.ana.id, incorporar);
      expect(r.offlineIssues).toEqual([]);
      // Reintento: no duplica el efectivo.
      await f.caja(f.ana.id, incorporar);
      expect(
        await tx.cashMovement.count({ where: { cashSessionId: aperturaId } }),
      ).toBe(1);
      expect(
        await tx.cashPendingCollection.findUniqueOrThrow({
          where: { id: pendiente.id },
        }),
      ).toMatchObject({ assignedSessionId: aperturaId });
      // 100 de fondo + 50 del cobro.
      const cierre = await f.caja(f.ana.id, {
        tipo: "CIERRE",
        occurredAt: f.hace(30),
        sessionId: aperturaId,
        closingAmountMinor: 15000,
        expectedAmountMinor: 15000,
      });
      expect(cierre.offlineIssues).toEqual([]);
    }));

  it("si otra PC ya lo incorporó o la sesión ya estaba cerrada, no mueve plata y avisa", () =>
    enRollback(async (tx, f) => {
      const sesion = await f.caja(f.ana.id, {
        tipo: "APERTURA",
        occurredAt: f.hace(60),
        cashRegisterId: f.register.id,
        openingAmountMinor: 0,
      });
      const sessionId = sesion.entityId!;
      // Otra PC, con conexión, ya lo incorporó.
      const yaHecho = await f.cobro();
      await f.cash.assignCollection(
        f.beto.id,
        f.org.id,
        f.branch.id,
        yaHecho.id,
        sessionId,
      );
      const otra = await f.caja(f.ana.id, {
        tipo: "COBRO_INCORPORAR",
        occurredAt: f.hace(50),
        collectionId: yaHecho.id,
        sessionId: randomUUID(),
      });
      expect(otra.offlineIssues.map((a) => a.kind)).toEqual([
        "COBRO_YA_ASIGNADO",
      ]);
      expect(
        await tx.cashMovement.count({ where: { cashSessionId: sessionId } }),
      ).toBe(1);
      const quitar = await f.caja(f.ana.id, {
        tipo: "COBRO_QUITAR",
        occurredAt: f.hace(45),
        collectionId: yaHecho.id,
        expectedRegisterId: f.register.id,
      });
      expect(quitar.offlineIssues.map((a) => a.kind)).toEqual([
        "COBRO_YA_ASIGNADO",
      ]);
      // La sesión se cerró antes de que llegara: el cobro sigue pendiente.
      await f.caja(f.ana.id, {
        tipo: "CIERRE",
        occurredAt: f.hace(40),
        sessionId,
        closingAmountMinor: 5000,
        expectedAmountMinor: 5000,
      });
      const tarde = await f.cobro(3000n);
      const cerrada = await f.caja(f.ana.id, {
        tipo: "COBRO_INCORPORAR",
        occurredAt: f.hace(30),
        collectionId: tarde.id,
        sessionId,
      });
      expect(cerrada.offlineIssues.map((a) => a.kind)).toEqual([
        "CAJA_CERRADA",
      ]);
      expect(
        await tx.cashPendingCollection.findUniqueOrThrow({
          where: { id: tarde.id },
        }),
      ).toMatchObject({ assignedSessionId: null });
    }));
});
