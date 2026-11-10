import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { InventoryService } from "../src/inventory/inventory.service";

const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);
const fecha = (dias: number) =>
  new Date(hace(dias).getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

// SISTEMA-74 (decisión del usuario, 10/11/2026): Compras e Inventario traen por
// defecto los últimos 90 días (Compras, además, todos los pedidos abiertos).
// Lo anterior se ve eligiendo fechas.
describe("historiales acotados (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `historiales_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursal = randomUUID();
  const usuario = randomUUID();
  const ids = {
    abiertoViejo: randomUUID(),
    recibidoViejo: randomUUID(),
    recibidoReciente: randomUUID(),
  };

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
    await db.organization.create({ data: { id: org, name: "Historiales" } });
    await db.branch.create({
      data: { id: sucursal, organizationId: org, name: "Central", code: "CEN" },
    });
    await db.user.create({
      data: {
        id: usuario,
        email: `${usuario}@example.invalid`,
        passwordHash: "x",
      },
    });
    const permisos = await Promise.all(
      ["PURCHASE_READ", "INVENTORY_READ"].map((code) =>
        db.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const rol = await db.role.create({
      data: {
        organizationId: org,
        code: "COMPRAS",
        name: "Compras",
        permissions: { create: permisos.map((p) => ({ permissionId: p.id })) },
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
    const proveedor = await db.supplier.create({
      data: { organizationId: org, name: "Droguería" },
    });
    const producto = await db.product.create({
      data: { organizationId: org, name: "Ibuprofeno" },
    });
    const compra = (id: string, status: "ORDERED" | "RECEIVED", dias: number) =>
      db.purchase.create({
        data: {
          id,
          organizationId: org,
          branchId: sucursal,
          supplierId: proveedor.id,
          status,
          orderedAt: hace(dias),
          createdAt: hace(dias),
        },
      });
    await compra(ids.abiertoViejo, "ORDERED", 200);
    await compra(ids.recibidoViejo, "RECEIVED", 200);
    await compra(ids.recibidoReciente, "RECEIVED", 10);
    for (const dias of [200, 10])
      await db.inventoryMovement.create({
        data: {
          organizationId: org,
          branchId: sucursal,
          productId: producto.id,
          type: "ADJUSTMENT_IN",
          quantity: dias,
          occurredAt: hace(dias),
        },
      });
  }, 300000);

  afterAll(async () => {
    if (/^historiales_[a-f0-9]{32}$/.test(schema))
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  it("Compras: sin fechas, los pedidos abiertos y los últimos 90 días", async () => {
    const compras = app.get(PurchasesService);
    const porDefecto = await compras.list(usuario, org, sucursal);
    expect(porDefecto.map((c) => c.id).sort()).toEqual(
      [ids.abiertoViejo, ids.recibidoReciente].sort(),
    );
    const conFechas = await compras.list(usuario, org, sucursal, {
      desde: fecha(300),
      hasta: fecha(100),
    });
    expect(conFechas.map((c) => c.id).sort()).toEqual(
      [ids.abiertoViejo, ids.recibidoViejo].sort(),
    );
  });

  it("Inventario: sin fechas, los últimos 90 días; con fechas, ese rango", async () => {
    const inventario = app.get(InventoryService);
    expect(
      (await inventario.history(usuario, org, sucursal)).map((m) => m.quantity),
    ).toEqual([10]);
    expect(
      (
        await inventario.history(usuario, org, sucursal, { desde: fecha(300) })
      ).map((m) => m.quantity),
    ).toEqual([10, 200]);
  });
});
