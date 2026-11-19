import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { AuditService } from "../src/audit/audit.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { crearRolesPreventa } from "../src/organizations/organization-provisioning";
import { PreventaComisionesService } from "../src/preventa/preventa-comisiones.service";
import { PreventaPedidosService } from "../src/preventa/preventa-pedidos.service";
import { PreventaService } from "../src/preventa/preventa.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SalesService } from "../src/sales/sales.service";

/** Preventa (SISTEMA-108) contra un esquema aislado de gestion_dev. */
describe("preventa", () => {
  let app: TestingModule, db: PrismaService;
  let preventa: PreventaService,
    pedidos: PreventaPedidosService,
    comisiones: PreventaComisionesService;
  const schema = `preventa_${randomUUID().replaceAll("-", "")}`;

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
    preventa = new PreventaService(db);
    pedidos = new PreventaPedidosService(
      db,
      new SalesService(db, new AuditService(db)),
    );
    comisiones = new PreventaComisionesService(db);
  }, 100000);

  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^preventa_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function usuario(organizationId: string, roleIds: string[]) {
    const user = await db.user.create({
      data: { email: randomUUID() + "@example.invalid", passwordHash: "x" },
    });
    await db.userOrganization.create({
      data: {
        userId: user.id,
        organizationId,
        displayName: "Usuario " + user.id.slice(0, 4),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
    return user;
  }

  async function farmacia() {
    const org = await db.organization.create({
      data: { name: "Farmacia Preventa", preventaEnabled: true },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "C" },
    });
    // Los permisos base los carga el seed; los de preventa, la migración.
    for (const code of [
      "CATALOG_READ",
      "OFFER_READ",
      "PARTY_READ",
      "ACCOUNT_READ",
    ])
      await db.permission.upsert({
        where: { code },
        create: { code, description: code },
        update: {},
      });
    await crearRolesPreventa(db, org.id);
    const manage = await db.permission.findUniqueOrThrow({
      where: { code: "PREVENTA_MANAGE" },
    });
    const admin = await db.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Admin",
        permissions: { create: { permissionId: manage.id } },
      },
    });
    const roles = await db.role.findMany({ where: { organizationId: org.id } });
    const rol = (code: string) => roles.find((r) => r.code === code)!.id;
    const dueno = await usuario(org.id, [admin.id]);
    const vendedor = await usuario(org.id, [rol("PREVENTISTA")]);
    const otroVendedor = await usuario(org.id, [rol("PREVENTISTA")]);
    const repartidor = await usuario(org.id, [rol("REPARTIDOR")]);
    const general = await db.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    const producto = async (name: string, precio: bigint, stock = 0) => {
      const p = await db.product.create({
        data: {
          organizationId: org.id,
          name,
          prices: { create: { priceListId: general.id, amountMinor: precio } },
        },
      });
      if (stock)
        await db.productLot.create({
          data: {
            organizationId: org.id,
            branchId: branch.id,
            productId: p.id,
            number: "L1",
            quantity: stock,
            unitCostMinor: 1n,
          },
        });
      return p;
    };
    const gaseosa = await producto("Gaseosa", 100_000n, 50);
    const galletitas = await producto("Galletitas", 50_000n, 50);
    const cliente = await db.customer.create({
      data: {
        organizationId: org.id,
        name: "Kiosco Pepe",
        creditEnabled: true,
        creditLimitMinor: 100_000_000n,
      },
    });
    const sinCuenta = await db.customer.create({
      data: { organizationId: org.id, name: "Almacén Ana" },
    });
    const configurar = (
      deliveryEffect: "NONE" | "STOCK" | "SALE",
      extra: { sellerCanChangePrice?: boolean } = {},
    ) =>
      preventa.guardarConfiguracion(dueno.id, org.id, {
        branchId: branch.id,
        deliveryEffect,
        sellerCanChangePrice: extra.sellerCanChangePrice ?? false,
        sellerSeesAllCustomers: true,
        showStock: true,
        allowOutOfStock: false,
        applyOffers: true,
      });
    return {
      org,
      branch,
      dueno,
      vendedor,
      otroVendedor,
      repartidor,
      gaseosa,
      galletitas,
      cliente,
      sinCuenta,
      configurar,
    };
  }

  const pedido = (
    f: Awaited<ReturnType<typeof farmacia>>,
    cantidades: [number, number] = [2, 1],
    extra: { customerId?: string; unitPriceMinor?: string } = {},
  ) =>
    pedidos.crear(f.vendedor.id, f.org.id, {
      requestId: randomUUID(),
      customerId: extra.customerId ?? f.cliente.id,
      items: [
        {
          productId: f.gaseosa.id,
          quantity: cantidades[0],
          unitPriceMinor: extra.unitPriceMinor,
        },
        { productId: f.galletitas.id, quantity: cantidades[1] },
      ],
    });

  it("sin el módulo la API responde 403 y la habilitación crea los roles", async () => {
    const f = await farmacia();
    const roles = await db.role.findMany({
      where: {
        organizationId: f.org.id,
        code: { in: ["PREVENTISTA", "REPARTIDOR"] },
      },
    });
    expect(roles).toHaveLength(2);
    // Crearlos de nuevo no duplica nada.
    expect(await crearRolesPreventa(db, f.org.id)).toEqual([]);
    await db.organization.update({
      where: { id: f.org.id },
      data: { preventaEnabled: false },
    });
    await expect(preventa.contexto(f.vendedor.id, f.org.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("toma el pedido con precios del servidor, numera y reintenta sin duplicar", async () => {
    const f = await farmacia();
    await f.configurar("NONE");
    const requestId = randomUUID();
    const datos = {
      requestId,
      customerId: f.cliente.id,
      items: [
        { productId: f.gaseosa.id, quantity: 2 },
        { productId: f.galletitas.id, quantity: 1 },
      ],
    };
    const creado = await pedidos.crear(f.vendedor.id, f.org.id, datos);
    expect(creado.number).toBe(1);
    expect(creado.totalMinor).toBe("250000");
    expect(creado.status).toBe("PENDING");
    // Reenvío (por ejemplo, sin señal): devuelve el mismo pedido.
    const otraVez = await pedidos.crear(f.vendedor.id, f.org.id, datos);
    expect(otraVez.id).toBe(creado.id);
    await expect(
      pedidos.crear(f.vendedor.id, f.org.id, {
        ...datos,
        items: [{ productId: f.gaseosa.id, quantity: 9 }],
      }),
    ).rejects.toThrow(ConflictException);
    const segundo = await pedido(f);
    expect(segundo.number).toBe(2);
    // Sin stock suficiente no se toma (allowOutOfStock apagado).
    await expect(pedido(f, [999, 1])).rejects.toThrow(BadRequestException);
  });

  it("busca productos sin importar tildes y por palabras sueltas", async () => {
    const f = await farmacia();
    await f.configurar("NONE");
    // Productos nuevos sin stock: que igual se ofrezcan.
    await db.preventaSettings.update({
      where: { organizationId: f.org.id },
      data: { allowOutOfStock: true },
    });
    const general = await db.priceList.findFirstOrThrow({
      where: { organizationId: f.org.id, name: "Precio general" },
    });
    for (const name of ["Jabón de glicerina", "Ibuprofeno 400 mg x 10"])
      await db.product.create({
        data: {
          organizationId: f.org.id,
          name,
          prices: { create: { priceListId: general.id, amountMinor: 1000n } },
        },
      });
    const buscar = async (q: string) =>
      (await preventa.productos(f.vendedor.id, f.org.id, { q })).items.map(
        (p) => p.name,
      );
    expect(await buscar("jabon")).toEqual(["Jabón de glicerina"]);
    expect(await buscar("GLICERINA jabón")).toEqual(["Jabón de glicerina"]);
    expect(await buscar("ibuprofeno 400")).toEqual(["Ibuprofeno 400 mg x 10"]);
    expect(await buscar("100%")).toEqual([]);
  });

  it("el preventista baja el precio sólo si la farmacia lo habilita y nunca lo sube", async () => {
    const f = await farmacia();
    await f.configurar("NONE");
    await expect(
      pedido(f, [1, 1], { unitPriceMinor: "90000" }),
    ).rejects.toThrow(BadRequestException);
    await f.configurar("NONE", { sellerCanChangePrice: true });
    const conDescuento = await pedido(f, [1, 1], { unitPriceMinor: "90000" });
    expect(conDescuento.totalMinor).toBe("140000");
    await expect(
      pedido(f, [1, 1], { unitPriceMinor: "120000" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("cada uno ve lo suyo y el repartidor sólo lo que puede repartir", async () => {
    const f = await farmacia();
    await f.configurar("NONE");
    const mio = await pedido(f);
    const ajeno = await pedidos.crear(f.otroVendedor.id, f.org.id, {
      requestId: randomUUID(),
      customerId: f.cliente.id,
      items: [{ productId: f.gaseosa.id, quantity: 1 }],
    });
    const vistos = await pedidos.listar(f.vendedor.id, f.org.id, {});
    expect(vistos.items.map((p) => p.id)).toEqual([mio.id]);
    await expect(
      pedidos.detalle(f.vendedor.id, f.org.id, ajeno.id),
    ).rejects.toThrow();
    // El repartidor ve los pendientes sin asignar y se toma uno.
    const libres = await pedidos.listar(f.repartidor.id, f.org.id, {
      paraRepartir: true,
    });
    expect(libres.items).toHaveLength(2);
    await pedidos.asignar(f.repartidor.id, f.org.id, {
      orderIds: [mio.id],
      delivererId: f.repartidor.id,
    });
    // No puede asignárselo a otro.
    await expect(
      pedidos.asignar(f.repartidor.id, f.org.id, {
        orderIds: [ajeno.id],
        delivererId: f.vendedor.id,
      }),
    ).rejects.toThrow(ForbiddenException);
    // Un pedido en reparto ya no se edita.
    const enReparto = await pedidos.detalle(f.repartidor.id, f.org.id, mio.id);
    expect(enReparto.status).toBe("IN_DELIVERY");
    await expect(
      pedidos.editar(f.vendedor.id, f.org.id, mio.id, {
        expectedUpdatedAt: enReparto.updatedAt,
        items: [{ productId: f.gaseosa.id, quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
    // No se pudo entregar: vuelve a pendiente con la nota.
    const vuelto = await pedidos.devolverAPendiente(
      f.repartidor.id,
      f.org.id,
      mio.id,
      { expectedStatus: "IN_DELIVERY", note: "Estaba cerrado" },
      "noEntregado",
    );
    expect(vuelto.status).toBe("PENDING");
    expect(vuelto.deliveryNote).toBe("Estaba cerrado");
  });

  it("entregar como venta: stock, cobro pendiente de caja y saldo a cuenta corriente, una sola vez", async () => {
    const f = await farmacia();
    await f.configurar("SALE");
    const p = await pedido(f);
    const requestId = randomUUID();
    const entrega = {
      expectedStatus: "PENDING" as const,
      requestId,
      collectedMinor: "100000",
      method: "CASH" as const,
    };
    const entregado = await pedidos.entregar(
      f.repartidor.id,
      f.org.id,
      p.id,
      entrega,
    );
    expect(entregado.status).toBe("DELIVERED");
    expect(entregado.paymentStatus).toBe("PARCIAL");
    expect(entregado.saleId).toBeTruthy();
    const venta = await db.sale.findUniqueOrThrow({
      where: { id: entregado.saleId! },
      include: { items: true, payments: true },
    });
    expect(venta.totalMinor).toBe(250_000n);
    expect(venta.payments.map((x) => x.method).sort()).toEqual([
      "ACCOUNT",
      "CASH",
    ]);
    // El efectivo espera en Cobros pendientes a que lo rinda el repartidor.
    const pendiente = await db.cashPendingCollection.findFirstOrThrow({
      where: { sourceId: venta.id },
    });
    expect(pendiente.cashMinor).toBe(100_000n);
    const deuda = await db.customerAccountMovement.findFirstOrThrow({
      where: { saleId: venta.id, type: "DEBIT" },
    });
    expect(deuda.amountMinor).toBe(150_000n);
    const lotes = await db.productLot.findMany({
      where: { productId: f.gaseosa.id },
    });
    expect(lotes[0]!.quantity).toBe(48);
    // Reintento de la misma entrega: no hay segunda venta.
    await pedidos.entregar(f.repartidor.id, f.org.id, p.id, entrega);
    expect(await db.sale.count({ where: { organizationId: f.org.id } })).toBe(
      1,
    );
    // Un cliente sin cuenta corriente tiene que pagar todo.
    const otro = await pedido(f, [1, 1], { customerId: f.sinCuenta.id });
    await expect(
      pedidos.entregar(f.repartidor.id, f.org.id, otro.id, {
        expectedStatus: "PENDING",
        requestId: randomUUID(),
        collectedMinor: "0",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("entregar descontando stock y cobrar después sin pasarse del total", async () => {
    const f = await farmacia();
    await f.configurar("STOCK");
    const p = await pedido(f, [3, 0]);
    const entregado = await pedidos.entregar(f.repartidor.id, f.org.id, p.id, {
      expectedStatus: "PENDING",
      requestId: randomUUID(),
      collectedMinor: "0",
    });
    expect(entregado.paymentStatus).toBe("SIN_PAGO");
    expect(entregado.stockDeducted).toBe(true);
    const movimientos = await db.inventoryMovement.findMany({
      where: { referenceType: "PREVENTA_ORDER", referenceId: p.id },
    });
    expect(movimientos.reduce((s, m) => s + m.quantity, 0)).toBe(-3);
    const cobro = {
      requestId: randomUUID(),
      amountMinor: "200000",
      method: "TRANSFER" as const,
    };
    const pagado = await pedidos.cobrar(f.repartidor.id, f.org.id, p.id, cobro);
    expect(pagado.paidMinor).toBe("200000");
    // El mismo cobro reenviado no suma dos veces.
    await pedidos.cobrar(f.repartidor.id, f.org.id, p.id, cobro);
    await expect(
      pedidos.cobrar(f.repartidor.id, f.org.id, p.id, {
        requestId: randomUUID(),
        amountMinor: "200000",
        method: "CASH",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("comisiones: el porcentaje del preventista hasta pagarlas, después queda fijo", async () => {
    const f = await farmacia();
    await f.configurar("NONE");
    await preventa.cambiarComisionDelVendedor(
      f.dueno.id,
      f.org.id,
      f.vendedor.id,
      250,
    );
    const p = await pedido(f, [1, 0]);
    await pedidos.entregar(f.dueno.id, f.org.id, p.id, {
      expectedStatus: "PENDING",
      requestId: randomUUID(),
      collectedMinor: "100000",
    });
    const antes = await comisiones.comisiones(f.vendedor.id, f.org.id, {});
    expect(antes.pendienteMinor).toBe("2500");
    // El preventista no paga comisiones.
    await expect(
      comisiones.pagar(f.vendedor.id, f.org.id, {
        requestId: randomUUID(),
        sellerId: f.vendedor.id,
        orderIds: [p.id],
      }),
    ).rejects.toThrow(ForbiddenException);
    await comisiones.pagar(f.dueno.id, f.org.id, {
      requestId: randomUUID(),
      sellerId: f.vendedor.id,
      orderIds: [p.id],
    });
    // Cambiar el porcentaje después no toca lo pagado.
    await preventa.cambiarComisionDelVendedor(
      f.dueno.id,
      f.org.id,
      f.vendedor.id,
      1000,
    );
    const despues = await comisiones.comisiones(f.dueno.id, f.org.id, {});
    expect(despues.pendienteMinor).toBe("0");
    expect(despues.pagadoMinor).toBe("2500");
    await expect(
      comisiones.cambiarComisionDelPedido(f.dueno.id, f.org.id, p.id, 500),
    ).rejects.toThrow(ConflictException);
    const resumen = await comisiones.resumen(f.dueno.id, f.org.id, {
      desde: "2000-01-01",
      hasta: "2100-01-01",
    });
    expect(resumen.pedidos).toBe(1);
    expect(resumen.productos[0]?.productName).toBe("Gaseosa");
  });
});
