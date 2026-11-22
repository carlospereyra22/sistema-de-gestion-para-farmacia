import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";

import { AppModule } from "../src/app.module";
import { AuditService } from "../src/audit/audit.service";
import { CatalogoOnlineService } from "../src/catalogo-online/catalogo-online.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { crearRolesPreventa } from "../src/organizations/organization-provisioning";
import { PedidosService } from "../src/pedidos/pedidos.service";
import { PreventaPedidosService } from "../src/preventa/preventa-pedidos.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SalesService } from "../src/sales/sales.service";

/** Pantalla Pedidos (SISTEMA-119) contra un esquema aislado de gestion_dev. */
describe("pedidos del catálogo y de preventa juntos", () => {
  let app: TestingModule, db: PrismaService, pedidos: PedidosService;
  const schema = `pedidos_unificados_${randomUUID().replaceAll("-", "")}`;

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
    pedidos = new PedidosService(
      db,
      new CatalogoOnlineService(db),
      new PreventaPedidosService(
        db,
        new SalesService(db, new AuditService(db)),
      ),
    );
  }, 100000);

  afterAll(async () => {
    await db?.$disconnect();
    if (app && /^pedidos_unificados_[a-f0-9]{32}$/.test(schema))
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

  async function rol(organizationId: string, codigos: string[]) {
    const permisos = await Promise.all(
      codigos.map((code) =>
        db.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        }),
      ),
    );
    return db.role.create({
      data: {
        organizationId,
        code: randomUUID().slice(0, 8),
        name: codigos.join(" "),
        permissions: {
          create: permisos.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
  }

  async function farmacia() {
    const org = await db.organization.create({
      data: { name: "Farmacia Pedidos", catalogEnabled: true },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "C" },
    });
    await crearRolesPreventa(db, org.id);
    const roles = await db.role.findMany({ where: { organizationId: org.id } });
    const preventista = roles.find((r) => r.code === "PREVENTISTA")!;
    const dueno = await usuario(org.id, [
      (
        await rol(org.id, [
          "ORGANIZATION_MANAGE",
          "SALE_READ",
          "SALE_MANAGE",
          "PREVENTA_MANAGE",
        ])
      ).id,
    ]);
    const mostrador = await usuario(org.id, [
      (await rol(org.id, ["SALE_READ"])).id,
    ]);
    const vendedor = await usuario(org.id, [preventista.id]);
    const otroVendedor = await usuario(org.id, [preventista.id]);
    const lista = await db.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    const cliente = await db.customer.create({
      data: { organizationId: org.id, name: "Kiosco Pepe" },
    });
    const portal = await db.catalogPortalUser.create({
      data: {
        organizationId: org.id,
        customerId: cliente.id,
        name: "Pepe",
        email: randomUUID() + "@example.invalid",
        passwordHash: "x",
      },
    });
    let numero = 0;
    const delCatalogo = (
      status: "RECEIVED" | "DELIVERED" | "REJECTED",
      createdAt: string,
      totalMinor: bigint,
    ) =>
      db.catalogOrder.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          number: ++numero,
          customerId: cliente.id,
          portalUserId: portal.id,
          status,
          delivery: "PICKUP",
          priceListId: lista.id,
          totalMinor,
          requestId: randomUUID(),
          requestHash: "x",
          createdAt: new Date(createdAt),
        },
      });
    const dePreventa = (
      sellerId: string,
      status: "PENDING" | "DELIVERED",
      createdAt: string,
      totalMinor: bigint,
    ) =>
      db.preventaOrder.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          number: ++numero,
          customerId: cliente.id,
          sellerId,
          priceListId: lista.id,
          status,
          totalMinor,
          requestId: randomUUID(),
          requestHash: "x",
          createdAt: new Date(createdAt),
        },
      });
    return {
      org,
      dueno,
      mostrador,
      vendedor,
      otroVendedor,
      delCatalogo,
      dePreventa,
    };
  }

  it("la farmacia elige verlos juntos sólo con los dos módulos", async () => {
    const f = await farmacia();
    await expect(pedidos.listar(f.dueno.id, f.org.id, {})).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      pedidos.cambiarVista(f.mostrador.id, f.org.id, true),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      pedidos.cambiarVista(f.dueno.id, f.org.id, true),
    ).rejects.toThrow(BadRequestException);

    await db.organization.update({
      where: { id: f.org.id },
      data: { preventaEnabled: true },
    });
    await expect(
      pedidos.cambiarVista(f.dueno.id, f.org.id, true),
    ).resolves.toEqual({ unifiedOrders: true });
    const auditoria = await db.auditLog.findMany({
      where: {
        organizationId: f.org.id,
        action: "ORGANIZATION_UNIFIED_ORDERS_CHANGED",
      },
    });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      actorId: f.dueno.id,
      before: { unifiedOrders: false },
      after: { unifiedOrders: true },
    });

    // Si la plataforma apaga un módulo, la pantalla deja de existir.
    await db.organization.update({
      where: { id: f.org.id },
      data: { catalogEnabled: false },
    });
    await expect(pedidos.listar(f.dueno.id, f.org.id, {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("une las dos listas y cada uno ve lo que le permiten sus permisos", async () => {
    const f = await farmacia();
    await db.organization.update({
      where: { id: f.org.id },
      data: { preventaEnabled: true, unifiedOrders: true },
    });
    const viejoSinConfirmar = await f.delCatalogo(
      "RECEIVED",
      "2026-01-10T15:00:00.000Z",
      1_000n,
    );
    const entregado = await f.delCatalogo(
      "DELIVERED",
      "2026-11-20T15:00:00.000Z",
      2_000n,
    );
    await f.delCatalogo("REJECTED", "2026-11-21T15:00:00.000Z", 9_000n);
    const mio = await f.dePreventa(
      f.vendedor.id,
      "PENDING",
      "2026-11-21T12:00:00.000Z",
      3_000n,
    );
    const ajeno = await f.dePreventa(
      f.otroVendedor.id,
      "DELIVERED",
      "2026-11-22T12:00:00.000Z",
      4_000n,
    );

    const todo = await pedidos.listar(f.dueno.id, f.org.id, {});
    expect(todo.items.map((i) => [i.origen, i.pedido.id])).toEqual([
      ["preventa", ajeno.id],
      ["catalogo", expect.any(String)],
      ["preventa", mio.id],
      ["catalogo", entregado.id],
      ["catalogo", viejoSinConfirmar.id],
    ]);
    expect(todo.origenes).toEqual({ catalogo: true, preventa: true });
    expect(todo.porAtender).toEqual({ catalogo: 1, preventa: 1 });
    expect(todo.resumen).toEqual({ cantidad: 4, totalMinor: "10000" });

    // Lo que falta atender se ve aunque las fechas no lo incluyan.
    const porAtender = await pedidos.listar(f.dueno.id, f.org.id, {
      grupo: "por-atender",
      desde: "2026-11-01",
      hasta: "2026-11-22",
    });
    expect(porAtender.items.map((i) => i.pedido.id).sort()).toEqual(
      [viejoSinConfirmar.id, mio.id].sort(),
    );
    // En lo cerrado, las fechas sí cuentan.
    const entregados = await pedidos.listar(f.dueno.id, f.org.id, {
      grupo: "entregados",
      desde: "2026-11-21",
      hasta: "2026-11-22",
    });
    expect(entregados.items.map((i) => i.pedido.id)).toEqual([ajeno.id]);

    // El preventista elegido deja afuera los del catálogo.
    const deUno = await pedidos.listar(f.dueno.id, f.org.id, {
      vendedorId: f.vendedor.id,
    });
    expect(deUno.items.map((i) => i.pedido.id)).toEqual([mio.id]);

    const soloCatalogo = await pedidos.listar(f.dueno.id, f.org.id, {
      origen: "catalogo",
    });
    expect(soloCatalogo.items.every((i) => i.origen === "catalogo")).toBe(true);
    expect(soloCatalogo.porAtender).toEqual({ catalogo: 1, preventa: 1 });

    // Mostrador: sólo el catálogo.
    const mostrador = await pedidos.listar(f.mostrador.id, f.org.id, {});
    expect(mostrador.origenes).toEqual({ catalogo: true, preventa: false });
    expect(mostrador.items.every((i) => i.origen === "catalogo")).toBe(true);
    expect(mostrador.porAtender).toEqual({ catalogo: 1, preventa: 0 });

    // Preventista: sólo los suyos.
    const vendedor = await pedidos.listar(f.vendedor.id, f.org.id, {});
    expect(vendedor.origenes).toEqual({ catalogo: false, preventa: true });
    expect(vendedor.items.map((i) => i.pedido.id)).toEqual([mio.id]);
    expect(vendedor.porAtender).toEqual({ catalogo: 0, preventa: 1 });
  });
});
