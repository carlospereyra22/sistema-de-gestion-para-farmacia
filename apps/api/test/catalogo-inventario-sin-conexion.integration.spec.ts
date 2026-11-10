import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { CatalogOfflineService } from "../src/catalog/catalogo-sin-conexion.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { PriceListUpdates } from "../src/catalog/price-list-updates";
import type { OperacionCatalogoSinConexion } from "../src/catalog/producto-sin-conexion";
import type { OperacionInventarioSinConexion } from "../src/inventory/inventario-sin-conexion";

// SISTEMA-79: productos e inventario sin conexión, con las reglas que decidió
// el usuario (10/11/2026).
describe("productos e inventario sin conexión (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  let catalogo: CatalogService;
  let offline: CatalogOfflineService;
  let inventario: InventoryService;
  const schema = `catalogo_offline_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursal = randomUUID();
  const usuario = randomUUID();
  const pc = randomUUID();
  let proveedor: string;
  let existente: string;

  const hace = (minutos: number) =>
    new Date(Date.now() - minutos * 60000).toISOString();
  type SinBase<T> = T extends unknown
    ? Omit<T, "clientOperationId" | "occurredAt" | "deviceId">
    : never;
  const deCatalogo = (
    datos: SinBase<OperacionCatalogoSinConexion>,
    minutos = 30,
    id = randomUUID(),
  ) =>
    offline.catalogOffline(usuario, org, sucursal, {
      ...datos,
      clientOperationId: id,
      occurredAt: hace(minutos),
      deviceId: pc,
    } as OperacionCatalogoSinConexion);
  const deInventario = (
    datos: SinBase<OperacionInventarioSinConexion>,
    minutos = 30,
  ) =>
    inventario.inventoryOffline(usuario, org, sucursal, {
      ...datos,
      clientOperationId: randomUUID(),
      occurredAt: hace(minutos),
      deviceId: pc,
    } as OperacionInventarioSinConexion);
  /** Código EAN-13 con su dígito de control. */
  const ean = (base: string) => {
    const suma = [...base].reduce(
      (total, d, i) => total + Number(d) * (i % 2 ? 3 : 1),
      0,
    );
    return `${base}${(10 - (suma % 10)) % 10}`;
  };
  const avisos = (r: { offlineIssues: { kind: string }[] }) =>
    r.offlineIssues.map((i) => i.kind);

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
    catalogo = app.get(CatalogService);
    offline = app.get(CatalogOfflineService);
    inventario = app.get(InventoryService);
    await db.organization.create({ data: { id: org, name: "Sin conexión" } });
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
      [
        "CATALOG_READ",
        "CATALOG_MANAGE",
        "INVENTORY_READ",
        "INVENTORY_MANAGE",
      ].map((code) =>
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
        code: "OWNER",
        name: "Dueño",
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
    proveedor = (
      await db.supplier.create({
        data: { organizationId: org, name: "Droguería" },
      })
    ).id;
    existente = (
      await catalogo.create(usuario, org, {
        name: "Ibuprofeno 400",
        barcode: "7790000000011",
        priceMinor: 1000,
      })
    ).id;
  }, 300000);

  afterAll(async () => {
    if (/^catalogo_offline_[a-f0-9]{32}$/.test(schema))
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  it("alta: con el id de la PC, una sola vez", async () => {
    const id = randomUUID();
    const datos = {
      tipo: "ALTA" as const,
      cuerpo: {
        name: "Paracetamol 500",
        barcode: "7790000000028",
        priceMinor: 800,
      },
    };
    const primera = await deCatalogo(datos, 30, id);
    expect(primera.entityId).toBe(id);
    // Reintento de la PC: devuelve lo mismo y no crea otro.
    await deCatalogo(datos, 30, id).catch(() => undefined);
    expect(await db.product.count({ where: { name: "Paracetamol 500" } })).toBe(
      1,
    );
    expect(
      await db.productBarcode.findFirst({
        where: { productId: id, primary: true },
      }),
    ).toMatchObject({ code: "7790000000028" });
  });

  it("alta con un código que otra PC ya usó: se crea sin ese código y con aviso", async () => {
    const id = randomUUID();
    const r = await deCatalogo(
      {
        tipo: "ALTA",
        cuerpo: {
          name: "Ibuprofeno genérico",
          barcode: "7790000000011",
          priceMinor: 900,
        },
      },
      30,
      id,
    );
    expect(avisos(r)).toEqual(["CODIGO_REPETIDO"]);
    expect(await db.product.findUnique({ where: { id } })).toMatchObject({
      name: "Ibuprofeno genérico",
    });
    expect(await db.productBarcode.count({ where: { productId: id } })).toBe(0);
  });

  it("laboratorio creado sin conexión: el producto lo usa; si ya existía, usa el existente", async () => {
    const lab = randomUUID();
    await deCatalogo(
      { tipo: "OPCION", cuerpo: { type: "laboratories", name: "Bagó" } },
      40,
      lab,
    );
    const producto = randomUUID();
    await deCatalogo(
      {
        tipo: "ALTA",
        cuerpo: { name: "Amoxidal", priceMinor: 500, laboratoryId: lab },
      },
      39,
      producto,
    );
    expect(
      (await db.product.findUnique({ where: { id: producto } }))?.laboratoryId,
    ).toBe(lab);
    // Otra PC creó el mismo laboratorio: se usa el que ya está.
    const otro = randomUUID();
    const r = await deCatalogo(
      { tipo: "OPCION", cuerpo: { type: "laboratories", name: "bagó" } },
      38,
      otro,
    );
    expect(avisos(r)).toEqual(["OPCION_EXISTENTE"]);
    const segundo = randomUUID();
    await deCatalogo(
      {
        tipo: "ALTA",
        cuerpo: { name: "Amoxidal 1g", priceMinor: 700, laboratoryId: otro },
      },
      37,
      segundo,
    );
    expect(
      (await db.product.findUnique({ where: { id: segundo } }))?.laboratoryId,
    ).toBe(lab);
  });

  it("edición: un dato que otra PC cambió después queda; el resto se aplica", async () => {
    // Con conexión, ahora: cambia el nombre.
    await catalogo.updateProduct(usuario, org, existente, {
      name: "Ibuprofeno 400 mg",
    });
    // Sin conexión, hace una hora: nombre y descripción.
    const r = await deCatalogo(
      {
        tipo: "EDICION",
        productId: existente,
        cuerpo: { name: "Ibupirac", description: "Analgésico" },
      },
      60,
    );
    expect(avisos(r)).toEqual(["DATO_PISADO"]);
    expect(
      await db.product.findUnique({ where: { id: existente } }),
    ).toMatchObject({
      name: "Ibuprofeno 400 mg",
      description: "Analgésico",
    });
    // Una edición sin conexión posterior sí gana.
    await deCatalogo(
      {
        tipo: "EDICION",
        productId: existente,
        cuerpo: { name: "Ibupirac 400" },
      },
      0,
    );
    expect(
      (await db.product.findUnique({ where: { id: existente } }))?.name,
    ).toBe("Ibupirac 400");
  });

  it("inventario: ingreso a un producto creado sin conexión y salidas hasta lo que hay", async () => {
    const producto = randomUUID();
    await deCatalogo(
      { tipo: "ALTA", cuerpo: { name: "Alcohol 70", priceMinor: 300 } },
      50,
      producto,
    );
    await deInventario(
      {
        tipo: "INGRESO",
        cuerpo: {
          productId: producto,
          supplierId: proveedor,
          lotNumber: "A1",
          quantity: 10,
          unitCostMinor: 150,
          expiresAt: "2030-01-01",
        },
      },
      49,
    );
    const lote = { productId: producto, number: "A1" };
    await deInventario(
      { tipo: "AJUSTE", cuerpo: { lote, quantity: -4, reason: "Rotura" } },
      48,
    );
    const ajuste = await deInventario(
      { tipo: "AJUSTE", cuerpo: { lote, quantity: -100, reason: "Conteo" } },
      47,
    );
    expect(avisos(ajuste)).toEqual(["AJUSTE_SUPERA_STOCK"]);
    expect(ajuste.offlineIssues[0]?.detail).toMatchObject({
      pedido: 100,
      registrado: 6,
    });
    const l = await db.productLot.findFirstOrThrow({
      where: { productId: producto },
    });
    expect(l.quantity).toBe(0);
    // Sin stock: la devolución no registra nada y avisa.
    const devolucion = await deInventario(
      {
        tipo: "DEVOLUCION",
        cuerpo: { lote, supplierId: proveedor, quantity: 2, reason: "Vencido" },
      },
      46,
    );
    expect(avisos(devolucion)).toEqual(["AJUSTE_SUPERA_STOCK"]);
    expect(await db.supplierReturn.count({ where: { lotId: l.id } })).toBe(0);
  });

  it("devolución: hasta lo que tiene ese proveedor en el lote", async () => {
    await deInventario(
      {
        tipo: "INGRESO",
        cuerpo: {
          productId: existente,
          supplierId: proveedor,
          lotNumber: "B1",
          quantity: 5,
          unitCostMinor: 400,
        },
      },
      45,
    );
    const r = await deInventario(
      {
        tipo: "DEVOLUCION",
        cuerpo: {
          lote: { productId: existente, number: "B1" },
          supplierId: proveedor,
          quantity: 8,
          reason: "Error de pedido",
        },
      },
      44,
    );
    expect(r.offlineIssues[0]?.detail).toMatchObject({
      pedido: 8,
      registrado: 5,
    });
    expect(
      (
        await db.productLot.findFirstOrThrow({
          where: { productId: existente, number: "B1" },
        })
      ).quantity,
    ).toBe(0);
  });

  it("corrección de lote: un número repetido no se cambia; el vencimiento sí", async () => {
    for (const number of ["C1", "C2"])
      await deInventario(
        {
          tipo: "INGRESO",
          cuerpo: {
            productId: existente,
            supplierId: null,
            lotNumber: number,
            quantity: 3,
            unitCostMinor: 100,
          },
        },
        43,
      );
    const r = await deInventario(
      {
        tipo: "EDICION_LOTE",
        cuerpo: {
          lote: { productId: existente, number: "C1" },
          number: "C2",
          expiresAt: "2031-05-01",
          reason: "Corrección",
        },
      },
      42,
    );
    expect(avisos(r)).toEqual(["LOTE_REPETIDO"]);
    const c1 = await db.productLot.findFirstOrThrow({
      where: { productId: existente, number: "C1" },
    });
    expect(c1.expiresAt?.toISOString().slice(0, 10)).toBe("2031-05-01");
  });

  it("eliminar de la sucursal dando de baja stock que ya cambió: se rechaza y nada cambia", async () => {
    const producto = randomUUID();
    await deCatalogo(
      { tipo: "ALTA", cuerpo: { name: "Gasa", priceMinor: 100 } },
      25,
      producto,
    );
    await deInventario(
      {
        tipo: "INGRESO",
        cuerpo: {
          productId: producto,
          supplierId: null,
          lotNumber: "G1",
          quantity: 4,
          unitCostMinor: 50,
        },
      },
      24,
    );
    // Archivar no da de baja stock: se registra.
    await deCatalogo(
      {
        tipo: "ESTADO_SUCURSAL",
        productId: producto,
        cuerpo: {
          status: "ARCHIVED",
          expectedStatus: "ACTIVE",
          expectedUpdatedAt: null,
          reason: "Discontinuado",
        },
      },
      23,
    );
    const estado = await db.productBranchState.findFirstOrThrow({
      where: { productId: producto },
    });
    // En la PC se veían 2 unidades; el lote tiene 4.
    await expect(
      deCatalogo(
        {
          tipo: "ESTADO_SUCURSAL",
          productId: producto,
          cuerpo: {
            status: "DELETED",
            expectedStatus: "ARCHIVED",
            expectedUpdatedAt: estado.updatedAt.toISOString(),
            reason: "Sin venta",
            expectedStock: 2,
            confirmStockWriteOff: true,
          },
        },
        22,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (
        await db.productBranchState.findFirstOrThrow({
          where: { productId: producto },
        })
      ).status,
    ).toBe("ARCHIVED");
    expect(
      (await db.productLot.findFirstOrThrow({ where: { productId: producto } }))
        .quantity,
    ).toBe(4);
  });

  it("eliminar un producto que se usó mientras tanto: se rechaza", async () => {
    await expect(
      deCatalogo({ tipo: "ELIMINAR", productId: existente, cuerpo: {} }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      await db.product.findUnique({ where: { id: existente } }),
    ).not.toBeNull();
  });

  it("códigos equivalentes: uno usado por otro producto no se agrega y avisa", async () => {
    const otro = randomUUID();
    await deCatalogo(
      {
        tipo: "ALTA",
        cuerpo: { name: "Otro", barcode: ean("779000000003"), priceMinor: 100 },
      },
      20,
      otro,
    );
    const r = await deCatalogo({
      tipo: "CODIGO_AGREGAR",
      productId: existente,
      cuerpo: { code: ean("779000000003") },
    });
    expect(avisos(r)).toEqual(["CODIGO_REPETIDO"]);
    await deCatalogo({
      tipo: "CODIGO_AGREGAR",
      productId: existente,
      cuerpo: { code: ean("779000000004") },
    });
    expect(
      await db.productBarcode.count({
        where: { productId: existente, kind: "EQUIVALENT" },
      }),
    ).toBe(1);
    // Quitar uno que ya no está no falla.
    await deCatalogo({
      tipo: "CODIGO_QUITAR",
      productId: existente,
      cuerpo: { code: ean("779000000005") },
    });
  });

  // --- Categorías, laboratorios y listas de precios (SISTEMA-80) ---

  it("categoría: renombrar sin conexión no pisa un cambio posterior; un nombre usado no se cambia", async () => {
    const cat = randomUUID();
    await deCatalogo(
      {
        tipo: "OPCION",
        cuerpo: { type: "categories", name: "Dermo", icon: "auto" },
      },
      90,
      cat,
    );
    await deCatalogo(
      { tipo: "OPCION", cuerpo: { type: "categories", name: "Bebés" } },
      89,
    );
    // Con conexión, ahora.
    await catalogo.changeNamedItem(
      usuario,
      org,
      "categories",
      cat,
      "Dermocosmética",
    );
    const pisada = await deCatalogo(
      {
        tipo: "OPCION_EDICION",
        cuerpo: { type: "categories", id: cat, name: "Piel" },
      },
      60,
    );
    expect(avisos(pisada)).toEqual(["DATO_PISADO"]);
    const repetido = await deCatalogo(
      {
        tipo: "OPCION_EDICION",
        cuerpo: { type: "categories", id: cat, name: "bebés" },
      },
      0,
    );
    expect(avisos(repetido)).toEqual(["NOMBRE_REPETIDO"]);
    expect((await db.category.findUnique({ where: { id: cat } }))?.name).toBe(
      "Dermocosmética",
    );
  });

  it("eliminar una categoría que mientras tanto tiene productos: se rechaza", async () => {
    const cat = randomUUID();
    await deCatalogo(
      { tipo: "OPCION", cuerpo: { type: "categories", name: "Ortopedia" } },
      30,
      cat,
    );
    await deCatalogo(
      {
        tipo: "ALTA",
        cuerpo: { name: "Muñequera", priceMinor: 100, categoryId: cat },
      },
      29,
    );
    await expect(
      deCatalogo(
        { tipo: "OPCION_BAJA", cuerpo: { type: "categories", id: cat } },
        28,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect((await db.category.findUnique({ where: { id: cat } }))?.active).toBe(
      true,
    );
  });

  it("lista de precios: alta con todos los productos y precios, el más reciente gana", async () => {
    const lista = randomUUID();
    await deCatalogo(
      { tipo: "LISTA_ALTA", cuerpo: { name: "Mayorista", includeAll: true } },
      90,
      lista,
    );
    const precio = (productId: string) =>
      db.productPrice
        .findUnique({
          where: { productId_priceListId: { productId, priceListId: lista } },
        })
        .then((p) => p?.amountMinor.toString() ?? null);
    const antes = await precio(existente);
    expect(antes).not.toBeNull();
    // Otra PC (con conexión, ahora) cambia el precio.
    await app.get(PriceListUpdates).save(usuario, org, lista, {
      requestId: randomUUID(),
      changes: [
        { productId: existente, expectedMinor: antes, amountMinor: "5000" },
      ],
    });
    // Sin conexión, hace una hora, otro precio: queda el de ahora.
    const viejo = await deCatalogo(
      {
        tipo: "LISTA_PRECIOS",
        cuerpo: {
          priceListId: lista,
          changes: [
            { productId: existente, expectedMinor: antes, amountMinor: "4000" },
          ],
        },
      },
      60,
    );
    expect(avisos(viejo)).toEqual(["DATO_PISADO"]);
    expect(await precio(existente)).toBe("5000");
    // Sin conexión, después del cambio: gana aunque viera otro precio.
    await deCatalogo(
      {
        tipo: "LISTA_PRECIOS",
        cuerpo: {
          priceListId: lista,
          changes: [
            { productId: existente, expectedMinor: antes, amountMinor: "6000" },
          ],
        },
      },
      0,
    );
    expect(await precio(existente)).toBe("6000");
    // Otra lista con el mismo nombre: se usa la existente.
    const otra = await deCatalogo(
      { tipo: "LISTA_ALTA", cuerpo: { name: "mayorista" } },
      0,
    );
    expect(avisos(otra)).toEqual(["OPCION_EXISTENTE"]);
    expect(otra.entityId).toBe(lista);
  });

  it("lista de precios: renombrar a un nombre usado no se cambia", async () => {
    const a = randomUUID();
    await deCatalogo(
      { tipo: "LISTA_ALTA", cuerpo: { name: "Obra social A" } },
      20,
      a,
    );
    await deCatalogo(
      { tipo: "LISTA_ALTA", cuerpo: { name: "Obra social B" } },
      19,
    );
    const r = await deCatalogo(
      {
        tipo: "LISTA_EDICION",
        cuerpo: { priceListId: a, name: "Obra social B" },
      },
      18,
    );
    expect(avisos(r)).toEqual(["NOMBRE_REPETIDO"]);
    expect((await db.priceList.findUnique({ where: { id: a } }))?.name).toBe(
      "Obra social A",
    );
  });
});
