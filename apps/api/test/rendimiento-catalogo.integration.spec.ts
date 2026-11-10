import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { CatalogService } from "../src/catalog/catalog.service";
import { PriceListUpdates } from "../src/catalog/price-list-updates";
import { InventoryService } from "../src/inventory/inventory.service";
import { PurchasesService } from "../src/purchases/purchases.service";
import { SupplierPayablesService } from "../src/supplier-payables/supplier-payables.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { PartiesService } from "../src/parties/parties.service";

// Medición de rendimiento con un catálogo grande (60.000 productos, 2
// sucursales). Sólo corre con RENDIMIENTO=1, contra un esquema aislado de
// gestion_dev que se borra al final:
//   $env:RENDIMIENTO = "1"; pnpm --filter @gestion/api exec jest --runInBand test/rendimiento-catalogo
// Imprime tiempo y tamaño de cada consulta pesada para comparar antes y después.
const PRODUCTOS = Number(process.env.RENDIMIENTO_PRODUCTOS ?? 60000);
const LOTES_POR_SUCURSAL = Number(process.env.RENDIMIENTO_LOTES ?? 20000);
const COMPRAS = Number(process.env.RENDIMIENTO_COMPRAS ?? 3000);
const DEUDAS = Number(process.env.RENDIMIENTO_DEUDAS ?? 3000);
const CLIENTES = Number(process.env.RENDIMIENTO_CLIENTES ?? 3000);
// Prueba de carga (SISTEMA-77): PCs actualizando a la vez, repartidas en las
// sucursales, y cuántas vueltas.
const PCS = Number(process.env.RENDIMIENTO_PCS ?? 10);
const VUELTAS = Number(process.env.RENDIMIENTO_VUELTAS ?? 5);
const describir = process.env.RENDIMIENTO === "1" ? describe : describe.skip;

describir("rendimiento con catálogo grande (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `rendimiento_${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID();
  const sucursales = [randomUUID(), randomUUID()];
  const usuario = randomUUID();
  const medidas: string[] = [];

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
    await poblar();
  }, 600000);

  afterAll(async () => {
    console.log(
      `\nRendimiento (${PRODUCTOS} productos):\n${medidas.join("\n")}`,
    );
    if (/^rendimiento_[a-f0-9]{32}$/.test(schema))
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db?.$disconnect();
    await app?.close();
  }, 120000);

  /** Catálogo, precios, códigos, lotes y movimientos con SQL masivo. */
  async function poblar() {
    await db.organization.create({
      data: { id: org, name: "Farmacia grande" },
    });
    for (const [i, id] of sucursales.entries())
      await db.branch.create({
        data: {
          id,
          organizationId: org,
          name: `Sucursal ${i + 1}`,
          code: `S${i + 1}`,
        },
      });
    await db.user.create({
      data: {
        id: usuario,
        email: `${usuario}@example.invalid`,
        passwordHash: "x",
      },
    });
    const codigos = [
      "CATALOG_READ",
      "INVENTORY_READ",
      "COST_READ",
      "PURCHASE_READ",
      "PAYABLE_READ",
      "ACCOUNT_READ",
      "PARTY_READ",
    ];
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
        code: "ADMIN",
        name: "Admin",
        permissions: { create: permisos.map((p) => ({ permissionId: p.id })) },
      },
    });
    await db.userOrganization.create({
      data: {
        organizationId: org,
        userId: usuario,
        displayName: "Ana",
        roles: { create: { roleId: rol.id } },
      },
    });
    for (const branchId of sucursales)
      await db.userBranch.create({ data: { userId: usuario, branchId } });
    const general = await db.priceList.create({
      data: { organizationId: org, name: "Precio general" },
    });
    const sql = (texto: string) => db.$executeRawUnsafe(texto);
    await sql(`INSERT INTO "Product" (id, "organizationId", name, presentation, "activeIngredient", "updatedAt")
      SELECT gen_random_uuid(), '${org}', 'Producto ' || lpad(g::text, 6, '0'), 'x 30 comprimidos', 'Droga ' || (g % 900), now()
      FROM generate_series(1, ${PRODUCTOS}) g`);
    await sql(`INSERT INTO "ProductBarcode" (id, "organizationId", "productId", code, "primary")
      SELECT gen_random_uuid(), '${org}', id, '779' || lpad((row_number() over ())::text, 10, '0'), true FROM "Product"`);
    await sql(`INSERT INTO "ProductPrice" ("productId", "priceListId", "amountMinor", "updatedAt")
      SELECT id, '${general.id}', 100000 + (random() * 900000)::int, now() FROM "Product"`);
    for (const branchId of sucursales) {
      await sql(`INSERT INTO "ProductLot" (id, "organizationId", "branchId", "productId", number, quantity, "unitCostMinor", "expiresAt")
        SELECT gen_random_uuid(), '${org}', '${branchId}', id, 'L-' || left(id::text, 6), 1 + (random() * 50)::int, 50000, (now() + interval '200 days')::date
        FROM (SELECT id FROM "Product" ORDER BY random() LIMIT ${LOTES_POR_SUCURSAL}) p`);
      await sql(`INSERT INTO "InventoryMovement" (id, "organizationId", "branchId", "productId", "lotId", type, quantity, "unitCostMinor")
        SELECT gen_random_uuid(), "organizationId", "branchId", "productId", id, 'PURCHASE_RECEIPT', quantity, 50000
        FROM "ProductLot" WHERE "branchId" = '${branchId}'`);
    }
    // Ajustes de stock: el historial de Inventario pasa los 32.767 movimientos.
    await sql(`INSERT INTO "InventoryMovement" (id, "organizationId", "branchId", "productId", "lotId", type, quantity)
      SELECT gen_random_uuid(), "organizationId", "branchId", "productId", id, 'ADJUSTMENT_IN', 1
      FROM "ProductLot" WHERE "branchId" = '${sucursales[0]}'`);
    // Compras de la sucursal: COMPRAS compras de 30 renglones.
    await sql(`INSERT INTO "Supplier" (id, "organizationId", name, "updatedAt")
      SELECT gen_random_uuid(), '${org}', 'Droguería ' || g, now() FROM generate_series(1, 40) g`);
    await sql(`INSERT INTO "Purchase" (id, "organizationId", "branchId", "supplierId", status, "orderedAt", "receivedAt", "createdAt")
      SELECT gen_random_uuid(), '${org}', '${sucursales[0]}', (SELECT id FROM "Supplier" ORDER BY random() + g * 0 LIMIT 1), 'RECEIVED', now() - g * interval '1 hour', now() - g * interval '1 hour', now() - g * interval '1 hour'
      FROM generate_series(1, ${COMPRAS}) g`);
    await sql(`INSERT INTO "PurchaseItem" (id, "purchaseId", "productId", "orderedQuantity", "receivedQuantity", "unitCostMinor")
      SELECT gen_random_uuid(), c.id, p.id, 10, 10, 50000
      FROM "Purchase" c CROSS JOIN LATERAL (SELECT id FROM "Product" ORDER BY random() + length(c.id::text) * 0 LIMIT 30) p`);
    // Deudas con un vencimiento; la mitad pagadas. Deuda y vencimiento van en
    // la misma transacción: la base controla la suma al confirmar.
    await db.$transaction([
      db.$executeRawUnsafe(`INSERT INTO "SupplierPayableInvoice" (id, "organizationId", "branchId", "supplierId", "documentType", "pointOfSale", "documentNumber", "documentKey", "issuedOn", "amountMinor", "operationId", "requestHash", "createdById", "createdByName")
        SELECT gen_random_uuid(), '${org}', '${sucursales[0]}', (SELECT id FROM "Supplier" ORDER BY random() + g * 0 LIMIT 1), 'FACTURA_C', '0001', g::text, '1:' || g, current_date - (g % 90), 100000, gen_random_uuid(), repeat('a', 64), '${usuario}', 'Ana'
        FROM generate_series(1, ${DEUDAS}) g`),
      db.$executeRawUnsafe(`INSERT INTO "SupplierPayableDue" (id, "invoiceId", sequence, "dueOn", "amountMinor")
        SELECT gen_random_uuid(), id, 1, "issuedOn" + 30, "amountMinor" FROM "SupplierPayableInvoice"`),
    ]);
    await db.$transaction([
      db.$executeRawUnsafe(`INSERT INTO "SupplierPayablePayment" (id, "invoiceId", "organizationId", "branchId", "operationId", "requestHash", "amountMinor", "paidOn", method, "createdById", "createdByName")
        SELECT gen_random_uuid(), id, "organizationId", "branchId", gen_random_uuid(), repeat('b', 64), "amountMinor", current_date, 'TRANSFER', '${usuario}', 'Ana'
        FROM "SupplierPayableInvoice" WHERE "documentNumber"::int % 2 = 0`),
      db.$executeRawUnsafe(`INSERT INTO "SupplierPayableAllocation" (id, "invoiceId", "paymentId", "dueId", "amountMinor")
        SELECT gen_random_uuid(), pa."invoiceId", pa.id, d.id, pa."amountMinor"
        FROM "SupplierPayablePayment" pa JOIN "SupplierPayableDue" d ON d."invoiceId" = pa."invoiceId"`),
    ]);
    // Clientes con 20 movimientos de cuenta corriente cada uno.
    await sql(`INSERT INTO "Customer" (id, "organizationId", name, "creditEnabled", "updatedAt")
      SELECT gen_random_uuid(), '${org}', 'Cliente ' || lpad(g::text, 5, '0'), true, now() FROM generate_series(1, ${CLIENTES}) g`);
    await sql(`INSERT INTO "CustomerAccountMovement" (id, "organizationId", "branchId", "customerId", type, "amountMinor")
      SELECT gen_random_uuid(), '${org}', '${sucursales[0]}', c.id, CASE WHEN g % 2 = 0 THEN 'DEBIT' ELSE 'CREDIT' END::"CustomerAccountMovementType", 10000
      FROM "Customer" c CROSS JOIN generate_series(1, 20) g`);
    await sql(`ANALYZE`);
  }

  async function medir<T>(nombre: string, consulta: () => Promise<T>) {
    const inicio = performance.now();
    let respuesta: T;
    try {
      respuesta = await consulta();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      const ultima = mensaje.split("\n").filter(Boolean).at(-1) ?? mensaje;
      medidas.push(
        `  ${nombre.padEnd(34)} FALLA después de ${(performance.now() - inicio).toFixed(0)} ms: ${ultima}`,
      );
      return undefined;
    }
    const consultado = performance.now();
    const texto = JSON.stringify(respuesta, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const fin = performance.now();
    medidas.push(
      `  ${nombre.padEnd(34)} ${(consultado - inicio).toFixed(0).padStart(6)} ms + JSON ${(fin - consultado).toFixed(0).padStart(5)} ms · ${(texto.length / 1024 / 1024).toFixed(2)} MB`,
    );
    return respuesta;
  }

  it("mide las consultas que pide cada PC", async () => {
    const catalog = app.get(CatalogService);
    const precios = app.get(PriceListUpdates);
    const inventario = app.get(InventoryService);
    await medir("catálogo de la sucursal", () =>
      catalog.list(usuario, org, sucursales[0]),
    );
    await medir("catálogo de la organización", () =>
      catalog.list(usuario, org),
    );
    await medir("stock de la sucursal", () =>
      inventario.stock(usuario, org, sucursales[0]!),
    );
    await medir("precios efectivos", () => precios.effective(usuario, org));
    // Catálogo por partes (SISTEMA-74): lo que pide la PC en cada actualización.
    const versiones = await medir("versiones del catálogo", () =>
      catalog.catalogVersions(usuario, org, sucursales[0]),
    );
    if (versiones) {
      await medir("versiones (diccionario al día)", () =>
        catalog.catalogVersions(
          usuario,
          org,
          sucursales[0],
          versiones.diccionario.version,
        ),
      );
      await medir("32 partes del catálogo", () =>
        catalog.catalogParts(
          usuario,
          org,
          sucursales[0],
          Object.keys(versiones.partes).slice(0, 32),
        ),
      );
    }
    // Costos por partes (SISTEMA-78).
    const versionesDeCostos = await medir("versiones de costos", () =>
      inventario.costsVersions(usuario, org, sucursales[0]!),
    );
    if (versionesDeCostos)
      await medir("32 partes de costos", () =>
        inventario.costsParts(
          usuario,
          org,
          sucursales[0]!,
          Object.keys(versionesDeCostos.partes).slice(0, 32),
        ),
      );
    // Stock por partes (SISTEMA-77).
    const versionesDeStock = await medir("versiones del stock", () =>
      inventario.stockVersions(usuario, org, sucursales[0]!),
    );
    if (versionesDeStock)
      await medir("32 partes del stock", () =>
        inventario.stockParts(
          usuario,
          org,
          sucursales[0]!,
          Object.keys(versionesDeStock.partes).slice(0, 32),
        ),
      );
    // Resto de los módulos con volumen (SISTEMA-74).
    const compras = app.get(PurchasesService);
    const pagar = app.get(SupplierPayablesService);
    const cuentas = app.get(AccountsService);
    const partes = app.get(PartiesService);
    await medir(`compras (${COMPRAS})`, () =>
      compras.list(usuario, org, sucursales[0]!),
    );
    await medir("lotes para recibir", () =>
      compras.lots(usuario, org, sucursales[0]!),
    );
    await medir("historial de inventario", () =>
      inventario.history(usuario, org, sucursales[0]!),
    );
    await medir("costos de inventario", () =>
      inventario.costs(usuario, org, sucursales[0]!),
    );
    await medir(`cuentas por pagar (${DEUDAS})`, () =>
      pagar.list(usuario, org, sucursales[0]!, {}),
    );
    await medir("opciones de cuentas por pagar", () =>
      pagar.options(usuario, org, sucursales[0]!),
    );
    await medir(`cuentas corrientes (${CLIENTES})`, () =>
      cuentas.list(usuario, org),
    );
    await medir("movimientos de un cliente", async () =>
      cuentas.movements(
        usuario,
        org,
        (await cuentas.list(usuario, org))[0]!.id,
      ),
    );
    await medir("estado de cuenta (sucursal)", () =>
      cuentas.statement(usuario, org, sucursales[0]!),
    );
    // Estado de cuenta de lo que se imprime (SISTEMA-78).
    const unCliente = (await cuentas.list(usuario, org))[0]!.id;
    await medir("estado de cuenta (un cliente)", () =>
      cuentas.statement(usuario, org, sucursales[0]!, {
        customerId: unCliente,
      }),
    );
    await medir("estado de cuenta (desde hace 7 días)", () =>
      cuentas.statement(usuario, org, sucursales[0]!, {
        desde: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      }),
    );
    await medir("vencimientos de cuentas", () =>
      cuentas.dueDates(usuario, org, sucursales[0]!),
    );
    await medir("clientes", () => partes.list(usuario, org, "customers"));
    // Dos PCs (una por sucursal) pidiendo lo mismo a la vez.
    await medir("2 PCs a la vez (catálogo+stock)", () =>
      Promise.all(
        sucursales.map((branchId) =>
          Promise.all([
            catalog.list(usuario, org, branchId),
            inventario.stock(usuario, org, branchId),
          ]),
        ),
      ),
    );
  }, 600000);

  // Prueba de carga (SISTEMA-77): varias PCs de dos sucursales actualizan a la
  // vez, como después de cada venta. Antes cada PC pedía el catálogo y el stock
  // enteros; ahora pide las versiones y sólo la parte que cambió (en cada
  // vuelta se vende de un lote de cada sucursal).
  it("aguanta varias PCs actualizando a la vez", async () => {
    const catalog = app.get(CatalogService);
    const inventario = app.get(InventoryService);
    const pcs = Array.from({ length: PCS }, (_, i) => ({
      sucursal: sucursales[i % sucursales.length]!,
    }));
    const tamano = (valor: unknown) =>
      JSON.stringify(valor, (_, v: unknown) =>
        typeof v === "bigint" ? v.toString() : v,
      ).length;
    const vender = async () => {
      for (const branchId of sucursales)
        await db.$executeRaw`
          UPDATE "ProductLot" SET quantity = quantity - 1
          WHERE id = (SELECT id FROM "ProductLot"
            WHERE "branchId" = ${branchId}::uuid AND quantity > 1
            ORDER BY random() LIMIT 1)`;
    };
    const vueltas = async (
      nombre: string,
      actualizar: (pc: (typeof pcs)[number]) => Promise<number>,
    ) => {
      const tiempos: number[] = [];
      let bytes = 0;
      let memoria = 0;
      const inicio = performance.now();
      for (let v = 0; v < VUELTAS; v++) {
        await vender();
        await Promise.all(
          pcs.map(async (pc) => {
            const desde = performance.now();
            // En dos pasos: `bytes += await` pierde sumas entre PCs.
            const recibidos = await actualizar(pc);
            bytes += recibidos;
            tiempos.push(performance.now() - desde);
          }),
        );
        memoria = Math.max(memoria, process.memoryUsage().heapUsed);
      }
      const total = performance.now() - inicio;
      tiempos.sort((a, b) => a - b);
      const p95 = tiempos[Math.floor(tiempos.length * 0.95)] ?? 0;
      medidas.push(
        `  ${nombre.padEnd(34)} ${VUELTAS} vueltas × ${PCS} PCs: ${(total / 1000).toFixed(1)} s · por PC p50 ${tiempos[Math.floor(tiempos.length / 2)]!.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms · ${(bytes / 1024 / 1024).toFixed(0)} MB · memoria ${(memoria / 1024 / 1024).toFixed(0)} MB`,
      );
      return p95;
    };
    // Antes: catálogo y stock enteros en cada actualización.
    await vueltas("carga: catálogo y stock enteros", async (pc) => {
      const [catalogo, stock] = await Promise.all([
        catalog.list(usuario, org, pc.sucursal),
        inventario.stock(usuario, org, pc.sucursal),
      ]);
      return tamano(catalogo) + tamano(stock);
    });
    // Ahora: versiones y sólo las partes que cambiaron desde la vuelta anterior.
    const guardadas = new Map<string, Record<string, string>>();
    const p95 = await vueltas("carga: por partes", async (pc) => {
      const clave = pc.sucursal;
      const [catalogo, stock] = await Promise.all([
        catalog.catalogVersions(usuario, org, pc.sucursal, "x"),
        inventario.stockVersions(usuario, org, pc.sucursal),
      ]);
      const previas = guardadas.get(clave) ?? {};
      const cambiadas = Object.keys(stock.partes)
        .filter((parte) => previas[parte] !== stock.partes[parte])
        .slice(0, 32);
      guardadas.set(clave, stock.partes);
      const partes = cambiadas.length
        ? await inventario.stockParts(usuario, org, pc.sucursal, cambiadas)
        : undefined;
      return tamano(catalogo) + tamano(stock) + tamano(partes ?? {});
    });
    // Con 10 PCs a la vez, ninguna actualización debería tardar más de 10 s.
    expect(p95).toBeLessThan(10000);
  }, 1800000);
});
