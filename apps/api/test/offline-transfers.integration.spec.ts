import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AuditService } from "../src/audit/audit.service";
import {
  TERMINADAS_EN_LISTA,
  TransfersService,
} from "../src/transfers/transfers.service";
import type { OperacionTransferenciaSinConexion } from "../src/transfers/transferencia-sin-conexion";

const MINUTO = 60 * 1000;

// SISTEMA-71: transferencias sin conexión. Lo que salió o entró físicamente es
// definitivo: llega con su hora real, una sola vez, sin stock negativo, y lo que
// cambió mientras tanto queda como aviso.
describe("transferencias sin conexión (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `offline_transfers_${randomUUID().replaceAll("-", "")}`;
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
    if (app && /^offline_transfers_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function fixture(stock = 10) {
    const org = await db.organization.create({
      data: { name: "Transferencias sin conexión" },
    });
    const origen = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "ORI" },
    });
    const destino = await db.branch.create({
      data: { organizationId: org.id, name: "Norte", code: "DES" },
    });
    const user = await db.user.create({
      data: { email: `${randomUUID()}@example.invalid`, passwordHash: "x" },
    });
    const permission = await db.permission.upsert({
      where: { code: "INVENTORY_MANAGE" },
      update: {},
      create: { code: "INVENTORY_MANAGE", description: "INVENTORY_MANAGE" },
    });
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "STOCK",
        name: "Stock",
        permissions: { create: { permissionId: permission.id } },
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
    const product = await db.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    const lot = await db.productLot.create({
      data: {
        organizationId: org.id,
        branchId: origen.id,
        productId: product.id,
        number: "L-1",
        quantity: stock,
        unitCostMinor: 1000n,
      },
    });
    const audit = new AuditService(db);
    const transfers = new TransfersService(db, audit);
    const hace = (minutos: number) =>
      new Date(Date.now() - minutos * MINUTO).toISOString();
    type Cuerpo<T extends OperacionTransferenciaSinConexion["tipo"]> = Extract<
      OperacionTransferenciaSinConexion,
      { tipo: T }
    >["cuerpo"];
    const op = <T extends OperacionTransferenciaSinConexion["tipo"]>(
      tipo: T,
      cuerpo: Cuerpo<T>,
      minutos = 30,
    ) =>
      ({
        tipo,
        clientOperationId: randomUUID(),
        occurredAt: hace(minutos),
        deviceId: randomUUID(),
        cuerpo,
      }) as OperacionTransferenciaSinConexion;
    const enOrigen = (operacion: OperacionTransferenciaSinConexion) =>
      transfers.completeOffline(user.id, org.id, origen.id, operacion);
    const enDestino = (operacion: OperacionTransferenciaSinConexion) =>
      transfers.completeOffline(user.id, org.id, destino.id, operacion);
    const stockDe = async (branchId: string) =>
      (
        await db.productLot.findMany({
          where: { branchId, productId: product.id },
        })
      ).reduce((suma, l) => suma + l.quantity, 0);
    /** Transferencia ya en tránsito, despachada con conexión. */
    const enTransito = async (cantidad: number) => {
      const t = await transfers.create(user.id, org.id, origen.id, {
        destinationBranchId: destino.id,
        items: [{ lotId: lot.id, quantity: cantidad }],
      });
      await transfers.dispatch(user.id, org.id, origen.id, t.id);
      return t;
    };
    return {
      org,
      origen,
      destino,
      user,
      product,
      lot,
      audit,
      transfers,
      op,
      enOrigen,
      enDestino,
      stockDe,
      enTransito,
    };
  }

  it("preparada y despachada sin conexión: por su clave, con hora real y una sola vez", async () => {
    const f = await fixture(10);
    const preparar = f.op(
      "PREPARAR",
      {
        destinationBranchId: f.destino.id,
        items: [{ productId: f.product.id, lotNumber: "L-1", quantity: 4 }],
      },
      40,
    );
    const creada = await f.enOrigen(preparar);
    expect(creada.offlineIssues).toEqual([]);
    const despachar = f.op(
      "DESPACHAR",
      { transferId: preparar.clientOperationId },
      35,
    );
    await f.enOrigen(despachar);
    await f.enOrigen(despachar);
    await f.enOrigen(preparar);
    expect(await f.stockDe(f.origen.id)).toBe(6);
    const transfer = await db.transfer.findFirstOrThrow({
      where: { clientOperationId: preparar.clientOperationId },
    });
    expect(transfer.status).toBe("IN_TRANSIT");
    expect(transfer.createdAt.toISOString()).toBe(preparar.occurredAt);
    const salida = await db.inventoryMovement.findFirstOrThrow({
      where: { referenceId: transfer.id, type: "TRANSFER_OUT" },
    });
    expect(salida.occurredAt.toISOString()).toBe(despachar.occurredAt);
    expect(
      await db.transfer.count({ where: { organizationId: f.org.id } }),
    ).toBe(1);
  });

  it("stock de origen que ya no alcanza al despachar: lote en cero, nunca negativo, con aviso", async () => {
    const f = await fixture(5);
    const preparar = f.op("PREPARAR", {
      destinationBranchId: f.destino.id,
      items: [{ lotId: f.lot.id, quantity: 5 }],
    });
    await f.enOrigen(preparar);
    // Mientras tanto otra PC vendió 3.
    await db.productLot.update({
      where: { id: f.lot.id },
      data: { quantity: 2 },
    });
    const { offlineIssues } = await f.enOrigen(
      f.op("DESPACHAR", { transferId: preparar.clientOperationId }),
    );
    expect(offlineIssues.map((i) => i.kind)).toEqual(["STOCK_FALTANTE"]);
    expect(offlineIssues[0]!.detail).toMatchObject({ enviado: 5, faltan: 3 });
    expect(await f.stockDe(f.origen.id)).toBe(0);
    const transfer = await db.transfer.findFirstOrThrow({
      where: { clientOperationId: preparar.clientOperationId },
      include: { items: true },
    });
    expect(transfer.items[0]!.quantity).toBe(5);
  });

  it("con conexión, despachar sin stock suficiente se rechaza con un mensaje claro", async () => {
    const f = await fixture(5);
    const t = await f.transfers.create(f.user.id, f.org.id, f.origen.id, {
      destinationBranchId: f.destino.id,
      items: [{ lotId: f.lot.id, quantity: 5 }],
    });
    await db.productLot.update({
      where: { id: f.lot.id },
      data: { quantity: 2 },
    });
    await expect(
      f.transfers.dispatch(f.user.id, f.org.id, f.origen.id, t.id),
    ).rejects.toThrow("Revisá el stock antes de despachar");
    expect(await f.stockDe(f.origen.id)).toBe(2);
  });

  it("recibida sin conexión: suma el stock en destino; si otra PC ya la recibió no suma otra vez", async () => {
    const f = await fixture(10);
    const t = await f.enTransito(4);
    const primera = await f.enDestino(
      f.op("RECIBIR", { transferId: t.id }, 20),
    );
    expect(primera.offlineIssues).toEqual([]);
    expect(await f.stockDe(f.destino.id)).toBe(4);
    const otraPc = await f.enDestino(f.op("RECIBIR", { transferId: t.id }, 10));
    expect(otraPc.offlineIssues.map((i) => i.kind)).toEqual([
      "TRANSFERENCIA_YA_RECIBIDA",
    ]);
    expect(await f.stockDe(f.destino.id)).toBe(4);
  });

  it("despachada por otra PC: no descuenta otra vez y queda con aviso", async () => {
    const f = await fixture(10);
    const t = await f.enTransito(3);
    const { offlineIssues } = await f.enOrigen(
      f.op("DESPACHAR", { transferId: t.id }),
    );
    expect(offlineIssues.map((i) => i.kind)).toEqual([
      "TRANSFERENCIA_YA_DESPACHADA",
    ]);
    expect(await f.stockDe(f.origen.id)).toBe(7);
  });

  it("recibir una que todavía no fue despachada se rechaza", async () => {
    const f = await fixture(10);
    const t = await f.transfers.create(f.user.id, f.org.id, f.origen.id, {
      destinationBranchId: f.destino.id,
      items: [{ lotId: f.lot.id, quantity: 2 }],
    });
    await expect(
      f.enDestino(f.op("RECIBIR", { transferId: t.id })),
    ).rejects.toThrow("todavía no fue despachada");
    expect(await f.stockDe(f.destino.id)).toBe(0);
  });

  it("la lista trae todas las en curso y sólo las últimas terminadas", async () => {
    const f = await fixture(10);
    const base = Date.now() - 1000 * MINUTO;
    await db.transfer.createMany({
      data: Array.from({ length: TERMINADAS_EN_LISTA + 5 }, (_, i) => ({
        organizationId: f.org.id,
        sourceBranchId: f.origen.id,
        destinationBranchId: f.destino.id,
        status: "RECEIVED" as const,
        createdAt: new Date(base + i * MINUTO),
      })),
    });
    // Una en tránsito más vieja que todas las terminadas: igual aparece.
    await db.transfer.create({
      data: {
        organizationId: f.org.id,
        sourceBranchId: f.origen.id,
        destinationBranchId: f.destino.id,
        status: "IN_TRANSIT",
        createdAt: new Date(base - 10 * MINUTO),
      },
    });
    const lista = await f.transfers.list(f.user.id, f.org.id, f.origen.id);
    expect(lista).toHaveLength(TERMINADAS_EN_LISTA + 1);
    expect(lista.filter((t) => t.status === "IN_TRANSIT")).toHaveLength(1);
    expect(lista.at(-1)!.status).toBe("IN_TRANSIT");
  });

  it("si algo falla al recibir se deshace todo, y al reintentar se registra una sola vez", async () => {
    const f = await fixture(10);
    const t = await f.enTransito(4);
    const recibir = f.op("RECIBIR", { transferId: t.id });
    // Falla la auditoría de la recepción, después de sumar el stock.
    const espia = jest
      .spyOn(f.audit, "recordInTransaction")
      .mockImplementation(async (_tx, entry) => {
        if (entry.action === "RECEIVED") throw new Error("falla al terminar");
      });
    await expect(f.enDestino(recibir)).rejects.toThrow("falla al terminar");
    espia.mockRestore();
    expect(await f.stockDe(f.destino.id)).toBe(0);
    expect(
      (await db.transfer.findUniqueOrThrow({ where: { id: t.id } })).status,
    ).toBe("IN_TRANSIT");
    expect(
      await db.offlineOperation.count({
        where: { id: recibir.clientOperationId },
      }),
    ).toBe(0);
    await f.enDestino(recibir);
    await f.enDestino(recibir);
    expect(await f.stockDe(f.destino.id)).toBe(4);
    expect(
      await db.offlineOperation.count({
        where: { id: recibir.clientOperationId },
      }),
    ).toBe(1);
  });
});
