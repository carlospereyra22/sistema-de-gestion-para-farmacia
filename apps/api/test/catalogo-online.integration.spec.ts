import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { hash } from "@node-rs/argon2";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { CatalogoOnlineService } from "../src/catalogo-online/catalogo-online.service";
import { CatalogoPublicoService } from "../src/catalogo-online/catalogo-publico.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { cargarOfertasMotor } from "../src/offers/ofertas-carga";
import { PrismaService } from "../src/prisma/prisma.service";

/** Catálogo online (SISTEMA-107) contra un esquema aislado de gestion_dev. */
describe("catálogo online", () => {
  let app: TestingModule, db: PrismaService;
  let gestion: CatalogoOnlineService, publico: CatalogoPublicoService;
  const schema = `catalogo_online_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local test DB only");
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
      throw new Error(
        "Could not prepare isolated schema: " +
          String(result.stderr).replaceAll(url.toString(), "[database]"),
      );
    db = new PrismaService({
      databaseUrl: url.toString(),
    } as EnvironmentService);
    await db.$connect();
    gestion = new CatalogoOnlineService(db);
    publico = new CatalogoPublicoService(db);
  }, 100000);

  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^catalogo_online_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function farmacia(slug: string) {
    const org = await db.organization.create({
      data: { name: "Farmacia " + slug, catalogEnabled: true },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "C" },
    });
    const user = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    // Los permisos base los carga el seed, no las migraciones.
    const permissions = await Promise.all(
      ["ORGANIZATION_MANAGE", "SALE_READ", "SALE_MANAGE"].map((code) =>
        db.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        }),
      ),
    );
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Admin",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        roles: { create: { roleId: role.id } },
      },
    });
    const general = await db.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    const mayorista = await db.priceList.create({
      data: {
        organizationId: org.id,
        name: "Mayorista",
        fallbackPriceListId: general.id,
      },
    });
    const producto = async (
      name: string,
      precio: bigint,
      opciones: { receta?: boolean; stock?: number; mayorista?: bigint } = {},
    ) => {
      const p = await db.product.create({
        data: {
          organizationId: org.id,
          name,
          prescriptionRequired: opciones.receta ?? false,
          prices: {
            create: [
              { priceListId: general.id, amountMinor: precio },
              ...(opciones.mayorista
                ? [
                    {
                      priceListId: mayorista.id,
                      amountMinor: opciones.mayorista,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      if (opciones.stock)
        await db.productLot.create({
          data: {
            organizationId: org.id,
            branchId: branch.id,
            productId: p.id,
            number: "L1",
            quantity: opciones.stock,
            unitCostMinor: 1n,
          },
        });
      return p;
    };
    const conStock = await producto("Agua", 1000n, {
      stock: 5,
      mayorista: 800n,
    });
    const sinStock = await producto("Jabón", 500n);
    const receta = await producto("Antibiótico", 3000n, {
      receta: true,
      stock: 9,
    });
    const cliente = await db.customer.create({
      data: {
        organizationId: org.id,
        name: "Geriátrico Sol",
        priceListId: mayorista.id,
      },
    });
    await gestion.guardarConfiguracion(user.id, org.id, {
      slug,
      branchId: branch.id,
      published: true,
      displayName: "Farmacia " + slug,
      requireLogin: false,
      showPricesPublic: false,
      showOutOfStock: false,
      priceListId: null,
      pickupEnabled: true,
      deliveryEnabled: false,
      deductStockOnDelivery: false,
    });
    await gestion.crearUsuario(user.id, org.id, {
      customerId: cliente.id,
      name: "Compras Sol",
      email: "Compras@Sol.test",
      password: "clave-segura-1",
    });
    const cookie = await publico.ingresar(
      slug,
      "compras@sol.test",
      "clave-segura-1",
    );
    return { org, branch, user, cliente, conStock, sinStock, receta, cookie };
  }

  it("muestra sólo lo vendible, sin receta, y respeta el switch de stock", async () => {
    const f = await farmacia(`stock-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    const anonimo = await publico.productos(slug, undefined, {});
    expect(anonimo.items.map((p) => p.name)).toEqual(["Agua"]);
    // Sin sesión y con precios ocultos, no hay precio.
    expect(anonimo.items[0]?.priceMinor).toBeNull();
    // Con sesión, la lista del cliente (mayorista).
    const conSesion = await publico.productos(slug, f.cookie, {});
    expect(conSesion.items[0]?.priceMinor).toBe("800");

    await db.catalogSettings.update({
      where: { organizationId: f.org.id },
      data: { showOutOfStock: true },
    });
    const todos = await publico.productos(slug, f.cookie, {});
    expect(todos.items.map((p) => [p.name, p.inStock, p.priceMinor])).toEqual([
      ["Agua", true, "800"],
      // Sin precio en mayorista: cae a la lista de respaldo (general).
      ["Jabón", false, "500"],
    ]);
  });

  it("arma el pedido con los precios de la API y no lo duplica", async () => {
    const f = await farmacia(`pedido-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    const requestId = randomUUID();
    const pedido = {
      requestId,
      items: [
        { productId: f.conStock.id, quantity: 2 },
        { productId: f.conStock.id, quantity: 1 },
      ],
      delivery: "PICKUP" as const,
    };
    const creado = await publico.crearPedido(slug, f.cookie, pedido);
    expect(creado.number).toBe(1);
    expect(creado.totalMinor).toBe("2400");
    expect(creado.items).toEqual([
      expect.objectContaining({ quantity: 3, unitPriceMinor: "800" }),
    ]);
    // Reintento con el mismo id y contenido: el mismo pedido.
    expect((await publico.crearPedido(slug, f.cookie, pedido)).id).toBe(
      creado.id,
    );
    // Mismo id con otro contenido: rechazo.
    await expect(
      publico.crearPedido(slug, f.cookie, {
        ...pedido,
        items: [{ productId: f.conStock.id, quantity: 9 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Un total esperado distinto (precios cambiados) se rechaza.
    await expect(
      publico.crearPedido(slug, f.cookie, {
        ...pedido,
        requestId: randomUUID(),
        expectedTotalMinor: "1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Un medicamento bajo receta no se puede pedir.
    await expect(
      publico.crearPedido(slug, f.cookie, {
        ...pedido,
        requestId: randomUUID(),
        items: [{ productId: f.receta.id, quantity: 1 }],
      }),
    ).rejects.toThrow("ya no está disponible");
    // Sin sesión no se pide.
    await expect(
      publico.crearPedido(slug, undefined, {
        ...pedido,
        requestId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("numera sin repetir aunque lleguen pedidos a la vez", async () => {
    const f = await farmacia(`numeros-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    const pedidos = await Promise.all(
      Array.from({ length: 5 }, () =>
        publico.crearPedido(slug, f.cookie, {
          requestId: randomUUID(),
          items: [{ productId: f.conStock.id, quantity: 1 }],
          delivery: "PICKUP",
        }),
      ),
    );
    expect(pedidos.map((p) => p.number).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("la farmacia confirma y entrega; el cliente no cancela lo confirmado", async () => {
    const f = await farmacia(`estados-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    const creado = await publico.crearPedido(slug, f.cookie, {
      requestId: randomUUID(),
      items: [{ productId: f.conStock.id, quantity: 1 }],
      delivery: "PICKUP",
    });
    await expect(
      gestion.decidir(f.user.id, f.org.id, creado.id, "entregar", {
        expectedStatus: "RECEIVED",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const confirmado = await gestion.decidir(
      f.user.id,
      f.org.id,
      creado.id,
      "confirmar",
      { expectedStatus: "RECEIVED" },
    );
    expect(confirmado.status).toBe("CONFIRMED");
    await expect(
      publico.cancelar(slug, f.cookie, creado.id),
    ).rejects.toBeInstanceOf(ConflictException);
    // Otro empleado lo había visto como recibido: el cambio se rechaza.
    await expect(
      gestion.decidir(f.user.id, f.org.id, creado.id, "rechazar", {
        expectedStatus: "RECEIVED",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const entregado = await gestion.decidir(
      f.user.id,
      f.org.id,
      creado.id,
      "entregar",
      { expectedStatus: "CONFIRMED" },
    );
    expect(entregado.status).toBe("DELIVERED");
    // El pedido no tocó el stock: se vende después en Ventas.
    const lote = await db.productLot.findFirstOrThrow({
      where: { productId: f.conStock.id },
    });
    expect(lote.quantity).toBe(5);
  });

  it("con el switch, entregar descuenta el stock y sin stock no entrega", async () => {
    const f = await farmacia(`stock-entrega-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    await db.catalogSettings.update({
      where: { organizationId: f.org.id },
      data: { deductStockOnDelivery: true, showOutOfStock: true },
    });
    const confirmar = async (quantity: number) => {
      const creado = await publico.crearPedido(slug, f.cookie, {
        requestId: randomUUID(),
        items: [{ productId: f.conStock.id, quantity }],
        delivery: "PICKUP",
      });
      await gestion.decidir(f.user.id, f.org.id, creado.id, "confirmar", {
        expectedStatus: "RECEIVED",
      });
      return creado;
    };

    const chico = await confirmar(3);
    const entregado = await gestion.decidir(
      f.user.id,
      f.org.id,
      chico.id,
      "entregar",
      { expectedStatus: "CONFIRMED" },
    );
    expect(entregado.stockDeducted).toBe(true);
    const lote = await db.productLot.findFirstOrThrow({
      where: { productId: f.conStock.id },
    });
    expect(lote.quantity).toBe(2);
    const movimiento = await db.inventoryMovement.findFirstOrThrow({
      where: { referenceType: "CATALOG_ORDER", referenceId: chico.id },
    });
    expect(movimiento).toMatchObject({ type: "ADJUSTMENT_OUT", quantity: -3 });

    // Quedan 2: un pedido de 5 no se entrega y no toca nada.
    const grande = await confirmar(5);
    await expect(
      gestion.decidir(f.user.id, f.org.id, grande.id, "entregar", {
        expectedStatus: "CONFIRMED",
      }),
    ).rejects.toThrow("faltan 3");
    const sinCambios = await db.catalogOrder.findUniqueOrThrow({
      where: { id: grande.id },
    });
    expect(sinCambios.status).toBe("CONFIRMED");
    expect(
      (await db.productLot.findFirstOrThrow({ where: { id: lote.id } }))
        .quantity,
    ).toBe(2);
  });

  it("aplica sólo las ofertas del catálogo, con foto y tope compartido", async () => {
    const f = await farmacia(`ofertas-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    const oferta = async (
      channel: "POS" | "CATALOG" | "BOTH",
      datos: {
        type: "PERCENT" | "TIERED";
        percentBps?: number;
        maxUnitsTotal?: number;
        tiers?: { minQuantity: number; percentBps: number }[];
      },
    ) => {
      const creada = await db.offer.create({
        data: {
          organizationId: f.org.id,
          name: `Oferta ${channel}`,
          status: "PUBLISHED",
          startsAt: new Date("2026-01-01T00:00:00Z"),
          createdById: f.user.id,
          channel,
          type: datos.type,
          percentBps: datos.percentBps ?? null,
          maxUnitsTotal: datos.maxUnitsTotal ?? null,
        },
      });
      await db.offerTarget.create({
        data: {
          organizationId: f.org.id,
          offerId: creada.id,
          kind: "PRODUCT",
          productId: f.conStock.id,
        },
      });
      for (const tier of datos.tiers ?? [])
        await db.offerTier.create({
          data: { organizationId: f.org.id, offerId: creada.id, ...tier },
        });
      return creada;
    };
    // De mostrador: no aplica en el catálogo.
    await oferta("POS", { type: "PERCENT", percentBps: 5000 });
    // Del catálogo: escalones 2+ -10 %, 4+ -20 %, tope total 5 unidades.
    const escalones = await oferta("CATALOG", {
      type: "TIERED",
      maxUnitsTotal: 5,
      tiers: [
        { minQuantity: 2, percentBps: 1000 },
        { minQuantity: 4, percentBps: 2000 },
      ],
    });

    const lista = await publico.productos(slug, f.cookie, {});
    expect(lista.items[0]?.ofertas.map((o) => o.label)).toEqual([
      "x2 → 10% | x4 → 20%",
    ]);
    // Ventas (sin canal) no ve la del catálogo.
    const enVentas = await cargarOfertasMotor(db, f.org.id, {
      desde: new Date(),
    });
    expect(enVentas.map((o) => o.name)).toEqual(["Oferta POS"]);

    // Precio mayorista 800: 4 unidades = 3200 - 20 % = 2560.
    const cotizado = await publico.cotizar(slug, f.cookie, [
      { productId: f.conStock.id, quantity: 4 },
    ]);
    expect(cotizado).toMatchObject({ totalMinor: "2560", ahorroMinor: "640" });

    const creado = await publico.crearPedido(slug, f.cookie, {
      requestId: randomUUID(),
      items: [{ productId: f.conStock.id, quantity: 4 }],
      delivery: "PICKUP",
      expectedTotalMinor: "2560",
    });
    expect(creado.totalMinor).toBe("2560");
    expect(creado.items[0]).toMatchObject({
      unitPriceMinor: "800",
      discountMinor: "640",
      totalMinor: "2560",
    });
    const foto = await db.catalogOrderOffer.findFirstOrThrow({
      where: { orderId: creado.id },
    });
    expect(foto).toMatchObject({ offerId: escalones.id, units: 4 });

    // Del tope de 5 queda 1: en un segundo pedido de 2, sólo una unidad
    // lleva el escalón (10 % de 800), como en Ventas.
    const segundo = await publico.cotizar(slug, f.cookie, [
      { productId: f.conStock.id, quantity: 2 },
    ]);
    expect(segundo.ahorroMinor).toBe("80");
  });

  it("sin el módulo habilitado no hay catálogo ni ofertas de catálogo", async () => {
    const f = await farmacia(`modulo-${randomUUID().slice(0, 8)}`);
    const slug = (await gestion.configuracion(f.user.id, f.org.id)).slug;
    await db.organization.update({
      where: { id: f.org.id },
      data: { catalogEnabled: false },
    });
    // La gestión no lo deja usar y la página pública no se ofrece.
    await expect(gestion.configuracion(f.user.id, f.org.id)).rejects.toThrow(
      "no está habilitado",
    );
    await expect(publico.portada(slug, f.cookie)).rejects.toThrow(
      "no está disponible",
    );
    // Nada de lo cargado se borra: al volver a habilitarlo sigue igual.
    await db.organization.update({
      where: { id: f.org.id },
      data: { catalogEnabled: true },
    });
    expect((await publico.portada(slug, f.cookie)).user?.email).toBe(
      "compras@sol.test",
    );
  });

  it("desactivar al usuario corta su sesión y la dirección no se repite", async () => {
    const f = await farmacia(`sesion-${randomUUID().slice(0, 8)}`);
    const config = await gestion.configuracion(f.user.id, f.org.id);
    const [usuario] = await gestion.usuarios(f.user.id, f.org.id);
    expect(usuario?.email).toBe("compras@sol.test");
    await gestion.cambiarUsuario(f.user.id, f.org.id, usuario!.id, {
      active: false,
    });
    expect((await publico.portada(config.slug, f.cookie)).user).toBeNull();

    const otra = await farmacia(`otra-${randomUUID().slice(0, 8)}`);
    await expect(
      gestion.guardarConfiguracion(otra.user.id, otra.org.id, {
        ...(await gestion.configuracion(otra.user.id, otra.org.id)),
        priceListId: null,
        slug: config.slug,
      }),
    ).rejects.toThrow("ya la usa otra farmacia");
    // Una contraseña mal escrita no entra.
    await db.catalogPortalUser.update({
      where: { id: usuario!.id },
      data: { active: true, passwordHash: await hash("otra-clave-12") },
    });
    await expect(
      publico.ingresar(config.slug, "compras@sol.test", "clave-segura-1"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
