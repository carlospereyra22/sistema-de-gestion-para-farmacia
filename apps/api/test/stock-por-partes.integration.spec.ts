import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { InventoryService } from "../src/inventory/inventory.service";

// SISTEMA-77: el stock se sincroniza por partes, como el catálogo. Cada parte
// cambia de versión sólo cuando cambia lo que devuelve de sus lotes.
describe("stock por partes (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  let inventario: InventoryService;
  const schema = `stock_partes_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursal = randomUUID();
  const conCostos = randomUUID();
  const sinCostos = randomUUID();
  // Productos en partes distintas ("0a" y "1f").
  const productoA = `0a${randomUUID().slice(2)}`;
  const productoB = `1f${randomUUID().slice(2)}`;
  const loteA = randomUUID();
  const loteB = randomUUID();
  let proveedor: string;

  const usuario = async (id: string, codigos: string[]) => {
    await db.user.create({
      data: { id, email: `${id}@example.invalid`, passwordHash: "x" },
    });
    const permisos = await Promise.all(
      codigos.map((code) =>
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
        code: `R${id.slice(0, 8)}`,
        name: `Rol ${id.slice(0, 8)}`,
        permissions: { create: permisos.map((p) => ({ permissionId: p.id })) },
      },
    });
    await db.userOrganization.create({
      data: {
        organizationId: org,
        userId: id,
        roles: { create: { roleId: rol.id } },
      },
    });
    await db.userBranch.create({ data: { userId: id, branchId: sucursal } });
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
    inventario = app.get(InventoryService);
    await db.organization.create({
      data: { id: org, name: "Stock por partes" },
    });
    await db.branch.create({
      data: { id: sucursal, organizationId: org, name: "Central", code: "CEN" },
    });
    await usuario(conCostos, ["INVENTORY_READ", "COST_READ"]);
    await usuario(sinCostos, ["INVENTORY_READ"]);
    proveedor = (
      await db.supplier.create({
        data: { organizationId: org, name: "Droguería" },
      })
    ).id;
    for (const [id, name] of [
      [productoA, "Ibuprofeno"],
      [productoB, "Amoxicilina"],
    ] as const)
      await db.product.create({ data: { id, organizationId: org, name } });
    for (const [id, productId] of [
      [loteA, productoA],
      [loteB, productoB],
    ] as const) {
      await db.productLot.create({
        data: {
          id,
          organizationId: org,
          branchId: sucursal,
          productId,
          number: "L1",
          quantity: 10,
          unitCostMinor: 1500n,
          expiresAt: new Date("2030-01-01"),
        },
      });
      await db.inventoryMovement.create({
        data: {
          organizationId: org,
          branchId: sucursal,
          productId,
          lotId: id,
          type: "PURCHASE_RECEIPT",
          quantity: 10,
          supplierId: proveedor,
        },
      });
    }
  }, 300000);

  afterAll(async () => {
    if (/^stock_partes_[a-f0-9]{32}$/.test(schema))
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  const versiones = async (actor = conCostos) =>
    (await inventario.stockVersions(actor, org, sucursal)).partes;

  it("las partes juntas son el mismo stock que el pedido completo", async () => {
    const v = await versiones();
    expect(Object.keys(v).sort()).toEqual(["0a", "1f"]);
    const partes = await inventario.stockParts(
      conCostos,
      org,
      sucursal,
      Object.keys(v),
    );
    expect(partes.versiones).toEqual(v);
    const porId = (lotes: { id: string }[]) =>
      [...lotes].sort((a, b) => a.id.localeCompare(b.id));
    expect(porId(partes.lotes)).toEqual(
      porId(await inventario.stock(conCostos, org, sucursal)),
    );
    expect(partes.lotes[0]).toMatchObject({
      unitCostMinor: "1500",
      suppliers: [expect.objectContaining({ id: proveedor, quantity: 10 })],
    });
    // Una parte sin lotes no tiene versión.
    expect(
      (await inventario.stockParts(conCostos, org, sucursal, ["ff"])).versiones,
    ).toEqual({ ff: null });
  });

  it("un cambio en un lote cambia sólo la versión de su parte", async () => {
    const antes = await versiones();
    await db.productLot.update({
      where: { id: loteA },
      data: { quantity: 7 },
    });
    const despues = await versiones();
    expect(despues["0a"]).not.toBe(antes["0a"]);
    expect(despues["1f"]).toBe(antes["1f"]);
  });

  it("una devolución al proveedor cambia la versión aunque el lote quede igual", async () => {
    const antes = await versiones();
    await db.supplierReturn.create({
      data: {
        organizationId: org,
        branchId: sucursal,
        supplierId: proveedor,
        lotId: loteB,
        productId: productoB,
        quantity: 2,
        reason: "Vencido",
        actorId: conCostos,
      },
    });
    const despues = await versiones();
    expect(despues["1f"]).not.toBe(antes["1f"]);
    expect(despues["0a"]).toBe(antes["0a"]);
  });

  it("renombrar un producto o un proveedor cambia lo que corresponde", async () => {
    const antes = await versiones();
    await db.product.update({
      where: { id: productoB },
      data: { name: "Amoxicilina 500" },
    });
    const conNombre = await versiones();
    expect(conNombre["1f"]).not.toBe(antes["1f"]);
    expect(conNombre["0a"]).toBe(antes["0a"]);
    await db.supplier.update({
      where: { id: proveedor },
      data: { name: "Droguería del Sur" },
    });
    const conProveedor = await versiones();
    expect(conProveedor["0a"]).not.toBe(conNombre["0a"]);
    expect(conProveedor["1f"]).not.toBe(conNombre["1f"]);
  });

  it("quien no ve costos tiene otras versiones y no recibe el costo", async () => {
    const mias = await versiones(sinCostos);
    expect(mias["0a"]).not.toBe((await versiones())["0a"]);
    const { lotes } = await inventario.stockParts(sinCostos, org, sucursal, [
      "0a",
    ]);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).not.toHaveProperty("unitCostMinor");
  });

  it("un lote que se vació sale de su parte", async () => {
    await db.productLot.update({ where: { id: loteA }, data: { quantity: 0 } });
    expect(Object.keys(await versiones())).toEqual(["1f"]);
  });

  // Costos por partes (SISTEMA-78).
  const versionesDeCostos = async () =>
    (await inventario.costsVersions(conCostos, org, sucursal)).partes;

  it("los costos por partes, juntos, son los mismos que los costos enteros", async () => {
    const v = await versionesDeCostos();
    // El lote vaciado sigue contando para el último costo del producto.
    expect(Object.keys(v).sort()).toEqual(["0a", "1f"]);
    const { versiones: deLasPartes, partes } = await inventario.costsParts(
      conCostos,
      org,
      sucursal,
      Object.keys(v),
    );
    expect(deLasPartes).toEqual(v);
    const juntas = Object.values(partes);
    const enteros = await inventario.costs(conCostos, org, sucursal);
    const orden = <T>(lista: T[], clave: (x: T) => string) =>
      [...lista].sort((a, b) => clave(a).localeCompare(clave(b)));
    expect(
      orden(
        juntas.flatMap((p) => p.products),
        (p) => p.productId,
      ),
    ).toEqual(orden(enteros.products, (p) => p.productId));
    expect(
      orden(
        juntas.flatMap((p) => p.lots),
        (l) => l.lotId,
      ),
    ).toEqual(orden(enteros.lots, (l) => l.lotId));
    expect(juntas.flatMap((p) => p.adjustments)).toEqual(enteros.adjustments);
    expect(partes["1f"]!.suppliers).toEqual([
      expect.objectContaining({ id: proveedor }),
    ]);
    await expect(
      inventario.costsVersions(sinCostos, org, sucursal),
    ).rejects.toThrow();
  });

  it("una venta no cambia los costos; una recepción con costo, sí", async () => {
    const antes = await versionesDeCostos();
    await db.productLot.update({
      where: { id: loteB },
      data: { quantity: { decrement: 1 } },
    });
    expect(await versionesDeCostos()).toEqual(antes);
    await db.inventoryMovement.create({
      data: {
        organizationId: org,
        branchId: sucursal,
        productId: productoB,
        lotId: loteB,
        type: "PURCHASE_RECEIPT",
        quantity: 5,
        unitCostMinor: 2000n,
        supplierId: proveedor,
      },
    });
    const despues = await versionesDeCostos();
    expect(despues["1f"]).not.toBe(antes["1f"]);
    expect(despues["0a"]).toBe(antes["0a"]);
    const { partes } = await inventario.costsParts(conCostos, org, sucursal, [
      "1f",
    ]);
    expect(partes["1f"]!.products).toEqual([
      expect.objectContaining({ productId: productoB, unitCostMinor: "2000" }),
    ]);
  });
});
