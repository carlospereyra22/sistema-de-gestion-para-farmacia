import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { PriceListUpdates } from "../src/catalog/price-list-updates";
import { InventoryService } from "../src/inventory/inventory.service";

// SISTEMA-74: con unos miles de productos el listado del catálogo se caía
// (PostgreSQL rechazaba la consulta de los códigos de barras por la cantidad de
// parámetros y la profundidad de la condición). Con 9.000 productos tiene que
// andar y devolver lo mismo que antes para cada producto.
const PRODUCTOS = 9000;

describe("catálogo grande (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `catalogo_grande_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursal = randomUUID();
  const usuario = randomUUID();
  let general = "";

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
    await db.organization.create({
      data: { id: org, name: "Farmacia grande" },
    });
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
      ["CATALOG_READ", "INVENTORY_READ"].map((code) =>
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
        code: "ADMIN",
        name: "Admin",
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
    general = (
      await db.priceList.create({
        data: { organizationId: org, name: "Precio general" },
      })
    ).id;
    const sql = (texto: string) => db.$executeRawUnsafe(texto);
    await sql(`INSERT INTO "Product" (id, "organizationId", name, "updatedAt")
      SELECT gen_random_uuid(), '${org}', 'Producto ' || lpad(g::text, 6, '0'), now()
      FROM generate_series(1, ${PRODUCTOS}) g`);
    await sql(`INSERT INTO "ProductBarcode" (id, "organizationId", "productId", code, "primary")
      SELECT gen_random_uuid(), '${org}', id, '779' || lpad((row_number() over (order by name))::text, 10, '0'), true FROM "Product"`);
    await sql(`INSERT INTO "ProductPrice" ("productId", "priceListId", "amountMinor", "updatedAt")
      SELECT id, '${general}', 150000, now() FROM "Product"`);
    await sql(`INSERT INTO "ProductLot" (id, "organizationId", "branchId", "productId", number, quantity, "unitCostMinor")
      SELECT gen_random_uuid(), '${org}', '${sucursal}', id, 'L-1', 5, 1000 FROM "Product"`);
  }, 300000);

  afterAll(async () => {
    if (/^catalogo_grande_[a-f0-9]{32}$/.test(schema))
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  it("lista el catálogo completo con códigos, precio, categoría, laboratorio y estado", async () => {
    const padre = await db.category.create({
      data: { organizationId: org, name: "Medicamentos" },
    });
    const hija = await db.category.create({
      data: { organizationId: org, name: "Analgésicos", parentId: padre.id },
    });
    const lab = await db.laboratory.create({
      data: { organizationId: org, name: "Bagó" },
    });
    const primero = await db.product.findFirstOrThrow({
      where: { organizationId: org },
      orderBy: { name: "asc" },
    });
    await db.product.update({
      where: { id: primero.id },
      data: { categoryId: hija.id, laboratoryId: lab.id },
    });
    await db.productBarcode.create({
      data: {
        organizationId: org,
        productId: primero.id,
        code: "SG000000000001",
        kind: "INTERNAL",
      },
    });
    await db.productBranchState.create({
      data: {
        organizationId: org,
        branchId: sucursal,
        productId: primero.id,
        status: "ARCHIVED",
      },
    });
    const catalog = app.get(CatalogService);
    const deSucursal = await catalog.list(usuario, org, sucursal);
    expect(deSucursal).toHaveLength(PRODUCTOS);
    expect(deSucursal[0]).toMatchObject({
      id: primero.id,
      name: "Producto 000001",
      category: {
        id: hija.id,
        name: "Analgésicos",
        path: "Medicamentos › Analgésicos",
      },
      laboratory: { id: lab.id, name: "Bagó" },
      image: null,
      prices: [{ amountMinor: "150000" }],
      branchStatus: "ARCHIVED",
      active: false,
    });
    expect(deSucursal[0]!.barcodes).toEqual([
      { code: "7790000000001", primary: true, kind: "PACKAGE" },
      { code: "SG000000000001", primary: false, kind: "INTERNAL" },
    ]);
    expect(deSucursal[1]).toMatchObject({
      category: null,
      laboratory: null,
      branchStatus: "ACTIVE",
      branchStates: [],
      active: true,
    });
    // El de la organización no mira el estado de la sucursal.
    const deOrganizacion = await catalog.list(usuario, org);
    expect(deOrganizacion[0]).toMatchObject({ active: true, branchStates: [] });
  }, 120000);

  it("devuelve stock y precios efectivos de todo el catálogo", async () => {
    const stock = await app.get(InventoryService).stock(usuario, org, sucursal);
    expect(stock).toHaveLength(PRODUCTOS);
    expect(stock[0]!.productName).toMatch(/^Producto /);
    const precios = await app.get(PriceListUpdates).effective(usuario, org);
    expect(precios.prices).toHaveLength(PRODUCTOS);
    expect(precios.prices[0]).toMatchObject({
      amountMinor: "150000",
      source: "Precio general",
    });
  }, 120000);
  it("por partes: juntas dan el catálogo y sólo cambia la versión de lo que cambió", async () => {
    const catalog = app.get(CatalogService);
    const completo = await catalog.list(usuario, org, sucursal);
    const { partes, diccionario } = await catalog.catalogVersions(
      usuario,
      org,
      sucursal,
    );
    const nombres = Object.keys(partes).sort();
    expect(nombres.length).toBeGreaterThan(200);
    // Todas las partes, de a 32 como las pide la PC.
    const juntas: Awaited<
      ReturnType<CatalogService["catalogParts"]>
    >["productos"] = [];
    for (let i = 0; i < nombres.length; i += 32) {
      const tanda = nombres.slice(i, i + 32);
      const respuesta = await catalog.catalogParts(
        usuario,
        org,
        sucursal,
        tanda,
      );
      for (const parte of tanda)
        expect(respuesta.versiones[parte]).toBe(partes[parte]);
      juntas.push(...respuesta.productos);
    }
    expect(juntas).toHaveLength(completo.length);
    // Mismo contenido que el listado completo; categoría y laboratorio por id.
    const porId = new Map(juntas.map((p) => [p.id, p]));
    for (const producto of completo) {
      const { categoryId, laboratoryId, ...resto } = porId.get(producto.id)!;
      const { category, laboratory, ...esperado } = producto;
      expect(resto).toEqual(esperado);
      expect(categoryId ?? null).toBe(category?.id ?? null);
      expect(laboratoryId ?? null).toBe(laboratory?.id ?? null);
    }
    expect(diccionario).toMatchObject({
      categorias: expect.any(Array),
      laboratorios: expect.any(Array),
    });

    // Cambia un precio: cambia sólo la versión de su parte.
    const elegido = completo[10]!;
    await db.productPrice.update({
      where: {
        productId_priceListId: { productId: elegido.id, priceListId: general },
      },
      data: { amountMinor: 199900n },
    });
    const despues = await catalog.catalogVersions(
      usuario,
      org,
      sucursal,
      diccionario.version,
    );
    const cambiadas = nombres.filter((p) => despues.partes[p] !== partes[p]);
    expect(cambiadas).toEqual([elegido.id.slice(0, 2)]);
    // El diccionario no cambió: no se vuelve a mandar.
    expect(despues.diccionario).toEqual({ version: diccionario.version });

    // Un código de barras editado en su lugar también cambia la versión.
    await db.productBarcode.updateMany({
      where: { productId: completo[20]!.id },
      data: { primary: false },
    });
    const conCodigo = await catalog.catalogVersions(usuario, org, sucursal);
    expect(conCodigo.partes[completo[20]!.id.slice(0, 2)]).not.toBe(
      despues.partes[completo[20]!.id.slice(0, 2)],
    );
  }, 300000);
});
