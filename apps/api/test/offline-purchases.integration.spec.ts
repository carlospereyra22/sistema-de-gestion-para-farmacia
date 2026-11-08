import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { AuditService } from "../src/audit/audit.service";

const MINUTO = 60 * 1000;

// SISTEMA-69: compras sin conexión. Pedido, compra directa y recepción hechos
// sin internet llegan después, con su hora real y sin duplicarse.
describe("compras sin conexión (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `offline_purchases_${randomUUID().replaceAll("-", "")}`;
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
    if (app && /^offline_purchases_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function fixture() {
    const org = await db.organization.create({
      data: { name: "Compras sin conexión" },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "OFF" },
    });
    const user = await db.user.create({
      data: { email: `${randomUUID()}@example.invalid`, passwordHash: "x" },
    });
    const permissions = await Promise.all(
      [
        "PURCHASE_READ",
        "PURCHASE_MANAGE",
        "PURCHASE_RECEIVE",
        "PAYABLE_MANAGE",
        "INVENTORY_READ",
      ].map((code) =>
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
        code: "COMPRAS",
        name: "Compras",
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
    const supplier = await db.supplier.create({
      data: { organizationId: org.id, name: "Droguería" },
    });
    const product = await db.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    const purchases = new PurchasesService(db, new AuditService(db));
    const hace = (minutos: number) =>
      new Date(Date.now() - minutos * MINUTO).toISOString();
    const offline = (op: Parameters<PurchasesService["completeOffline"]>[3]) =>
      purchases.completeOffline(user.id, org.id, branch.id, op);
    return { org, branch, user, supplier, product, purchases, hace, offline };
  }

  it("pedido y recepción sin conexión: hora real, stock, deuda y sin duplicar", async () => {
    const f = await fixture();
    const pedidoHora = f.hace(120);
    const pedido = {
      tipo: "PEDIDO" as const,
      occurredAt: pedidoHora,
      cuerpo: {
        clientOperationId: randomUUID(),
        supplierId: f.supplier.id,
        items: [{ productId: f.product.id, quantity: 10, unitCostMinor: 5000 }],
      },
    };
    const creado = await f.offline(pedido);
    expect("id" in creado && (await f.offline(pedido))).toMatchObject({
      id: (creado as { id: string }).id,
    });
    const purchaseId = (creado as { id: string }).id;
    const compra = await db.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: { items: true },
    });
    expect(compra.orderedAt?.toISOString()).toBe(pedidoHora);

    const recepcionHora = f.hace(60);
    const recepcion = {
      tipo: "RECEPCION" as const,
      occurredAt: recepcionHora,
      purchaseId,
      cuerpo: {
        operationId: randomUUID(),
        debt: { amountMinor: "50000", dueOn: null },
        items: [
          {
            itemId: compra.items[0]!.id,
            quantity: 10,
            lotNumber: "L-SIN-RED",
          },
        ],
      },
    };
    await f.offline(recepcion);
    // Reenviar la misma recepción no suma dos veces.
    await f.offline(recepcion);
    const lote = await db.productLot.findFirstOrThrow({
      where: { branchId: f.branch.id, productId: f.product.id },
    });
    expect(lote.quantity).toBe(10);
    const movimiento = await db.inventoryMovement.findFirstOrThrow({
      where: { referenceId: purchaseId, type: "PURCHASE_RECEIPT" },
    });
    expect(movimiento.occurredAt.toISOString()).toBe(recepcionHora);
    expect(
      (
        await db.purchase.findUniqueOrThrow({ where: { id: purchaseId } })
      ).receivedAt?.toISOString(),
    ).toBe(recepcionHora);
    expect(
      await db.supplierPayableInvoice.count({
        where: { organizationId: f.org.id, purchaseId },
      }),
    ).toBe(1);
  });

  it("recibe en partes un pedido creado sin conexión, con los ids de la PC", async () => {
    const f = await fixture();
    const clave = randomUUID();
    await f.offline({
      tipo: "PEDIDO",
      occurredAt: f.hace(90),
      cuerpo: {
        clientOperationId: clave,
        supplierId: f.supplier.id,
        items: [{ productId: f.product.id, quantity: 10, unitCostMinor: 1000 }],
      },
    });
    // En la PC el pedido se conoce por su clave y el renglón por el producto.
    const recibir = (cantidad: number, lote: string, minutos: number) =>
      f.offline({
        tipo: "RECEPCION",
        occurredAt: f.hace(minutos),
        purchaseId: clave,
        cuerpo: {
          operationId: randomUUID(),
          items: [
            { itemId: f.product.id, quantity: cantidad, lotNumber: lote },
          ],
        },
      });
    await recibir(4, "P1", 60);
    await recibir(6, "P2", 30);
    const compra = await db.purchase.findFirstOrThrow({
      where: { clientOperationId: clave },
      include: { items: true },
    });
    expect(compra.status).toBe("RECEIVED");
    expect(compra.items[0]!.receivedQuantity).toBe(10);
    expect(
      (
        await db.productLot.aggregate({
          where: { branchId: f.branch.id, productId: f.product.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(10);
  });

  it("si algo falla al final de la transacción, no queda nada: ni compra, ni stock, ni deuda", async () => {
    const f = await fixture();
    const falla = async () => {
      throw new Error("falla al terminar");
    };
    const clave = randomUUID();
    const directa = {
      tipo: "DIRECTA" as const,
      occurredAt: f.hace(20),
      cuerpo: {
        clientOperationId: clave,
        supplierId: f.supplier.id,
        debt: { amountMinor: "4000", dueOn: null },
        items: [{ productId: f.product.id, quantity: 4, unitCostMinor: 1000 }],
        receipts: [{ productId: f.product.id, quantity: 4, lotNumber: "R1" }],
      },
    };
    await expect(
      f.purchases.completeOffline(
        f.user.id,
        f.org.id,
        f.branch.id,
        directa,
        falla,
      ),
    ).rejects.toThrow("falla al terminar");
    expect(
      await db.purchase.count({ where: { clientOperationId: clave } }),
    ).toBe(0);
    expect(
      await db.productLot.count({ where: { branchId: f.branch.id } }),
    ).toBe(0);
    expect(
      await db.supplierPayableInvoice.count({
        where: { organizationId: f.org.id },
      }),
    ).toBe(0);
    // Al reintentar sin la falla, se registra entera una sola vez.
    await f.offline(directa);
    expect(
      (
        await db.productLot.findFirstOrThrow({
          where: { branchId: f.branch.id },
        })
      ).quantity,
    ).toBe(4);

    // Lo mismo con una recepción: el pedido queda como estaba.
    const pedido = randomUUID();
    await f.offline({
      tipo: "PEDIDO",
      occurredAt: f.hace(15),
      cuerpo: {
        clientOperationId: pedido,
        supplierId: f.supplier.id,
        items: [{ productId: f.product.id, quantity: 3, unitCostMinor: 1000 }],
      },
    });
    await expect(
      f.purchases.completeOffline(
        f.user.id,
        f.org.id,
        f.branch.id,
        {
          tipo: "RECEPCION",
          occurredAt: f.hace(10),
          purchaseId: pedido,
          cuerpo: {
            operationId: randomUUID(),
            items: [{ itemId: f.product.id, quantity: 3, lotNumber: "R2" }],
          },
        },
        falla,
      ),
    ).rejects.toThrow("falla al terminar");
    const sinRecibir = await db.purchase.findFirstOrThrow({
      where: { clientOperationId: pedido },
      include: { items: true },
    });
    expect(sinRecibir.status).toBe("ORDERED");
    expect(sinRecibir.items[0]!.receivedQuantity).toBe(0);
    expect(
      await db.purchaseReceipt.count({ where: { purchaseId: sinRecibir.id } }),
    ).toBe(0);
  });

  it("compra directa sin conexión suma el stock una sola vez", async () => {
    const f = await fixture();
    const directa = {
      tipo: "DIRECTA" as const,
      occurredAt: f.hace(30),
      cuerpo: {
        clientOperationId: randomUUID(),
        supplierId: f.supplier.id,
        items: [{ productId: f.product.id, quantity: 4, unitCostMinor: 1000 }],
        receipts: [{ productId: f.product.id, quantity: 4, lotNumber: "D1" }],
      },
    };
    await f.offline(directa);
    await f.offline(directa);
    expect(
      (
        await db.productLot.findFirstOrThrow({
          where: { branchId: f.branch.id, productId: f.product.id },
        })
      ).quantity,
    ).toBe(4);
  });

  it("si otra PC ya recibió el pedido, la recepción de esta PC se rechaza", async () => {
    const f = await fixture();
    const creado = (await f.purchases.create(f.user.id, f.org.id, f.branch.id, {
      clientOperationId: randomUUID(),
      supplierId: f.supplier.id,
      items: [{ productId: f.product.id, quantity: 5, unitCostMinor: 1000 }],
    })) as { id: string };
    const item = await db.purchaseItem.findFirstOrThrow({
      where: { purchaseId: creado.id },
    });
    const recibir = (lotNumber: string) =>
      f.offline({
        tipo: "RECEPCION",
        occurredAt: f.hace(10),
        purchaseId: creado.id,
        cuerpo: {
          operationId: randomUUID(),
          items: [{ itemId: item.id, quantity: 5, lotNumber }],
        },
      });
    await recibir("PC-1");
    await expect(recibir("PC-2")).rejects.toThrow("saldo abierto");
    expect(
      await db.productLot.count({ where: { branchId: f.branch.id } }),
    ).toBe(1);
  });
});
