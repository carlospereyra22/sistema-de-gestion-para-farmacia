import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { AuditService } from "../src/audit/audit.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { SUPPLIER_ADJUSTMENT } from "../src/inventory/lot-suppliers";
import { PrismaService } from "../src/prisma/prisma.service";

describe("ajustes por proveedor en un esquema sintético aislado", () => {
  let app: TestingModule;
  let first: PrismaService;
  let second: PrismaService;
  const schema = `inventory_adjust_${randomUUID().replaceAll("-", "")}`;
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
      throw new Error("Could not prepare isolated schema");
    const environment = { databaseUrl: url.toString() } as EnvironmentService;
    first = new PrismaService(environment);
    second = new PrismaService(environment);
    await Promise.all([first.$connect(), second.$connect()]);
  }, 100000);
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    if (app && /^inventory_adjust_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  async function fixture() {
    const org = await first.organization.create({
      data: { name: "Synthetic inventory" },
    });
    const branch = await first.branch.create({
      data: { organizationId: org.id, name: "Test", code: "TEST" },
    });
    const user = await first.user.create({
      data: {
        email: randomUUID() + "@example.invalid",
        passwordHash: "fixture",
      },
    });
    const permissions = await Promise.all(
      // Revisa el historial de costos: necesita el permiso para verlos.
      ["INVENTORY_READ", "INVENTORY_MANAGE", "COST_READ"].map((code) =>
        first.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        }),
      ),
    );
    const role = await first.role.create({
      data: {
        organizationId: org.id,
        code: "ADMIN",
        name: "Test",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await first.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    await first.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    const [juan, carlos, otro] = await Promise.all(
      ["juan", "carlos", "otro"].map((name) =>
        first.supplier.create({ data: { organizationId: org.id, name } }),
      ),
    );
    const product = await first.product.create({
      data: { organizationId: org.id, name: "Producto" },
    });
    const [service, other] = [first, second].map(
      (db) => new InventoryService(db, new AuditService(db)),
    ) as [InventoryService, InventoryService];
    const scope = { organizationId: org.id, branchId: branch.id };
    const receive = (supplierId: string | null, quantity: number) =>
      service.receive(user.id, {
        ...scope,
        productId: product.id,
        supplierId,
        lotNumber: "L-1",
        quantity,
        unitCostMinor: 100,
      });
    await receive(juan!.id, 10);
    const lot = await receive(carlos!.id, 10);
    const adjust = (
      quantity: number,
      supplierId?: string | null,
      target = service,
      unitCostMinor?: number,
    ) =>
      target.adjust(user.id, {
        ...scope,
        lotId: lot.id,
        quantity,
        reason: "Conteo",
        supplierId,
        unitCostMinor,
      });
    const stock = async () => {
      const rows = await service.stock(user.id, org.id, branch.id);
      const row = rows.find((item) => item.id === lot.id)!;
      return {
        quantity: row.quantity,
        unassigned: row.unassignedQuantity,
        suppliers: Object.fromEntries(
          row.suppliers.map((item) => [item.name, item.quantity]),
        ),
      };
    };
    const history = () => service.costs(user.id, org.id, branch.id);
    const giveBack = (supplierId: string, quantity: number) =>
      service.supplierReturn(user.id, {
        ...scope,
        supplierId,
        lotId: lot.id,
        quantity,
        reason: "Vencido",
      });
    return {
      juan,
      carlos,
      otro,
      adjust,
      stock,
      lot,
      scope,
      other,
      history,
      giveBack,
    };
  }

  it("resta del proveedor elegido y no del más viejo", async () => {
    const f = await fixture();
    await f.adjust(-3, f.carlos!.id);
    expect(await f.stock()).toEqual({
      quantity: 17,
      unassigned: 0,
      suppliers: { juan: 10, carlos: 7 },
    });
  });
  it("suma al proveedor elegido, aunque no estuviera en el lote", async () => {
    const f = await fixture();
    await f.adjust(4, f.otro!.id);
    expect(await f.stock()).toEqual({
      quantity: 24,
      unassigned: 0,
      suppliers: { juan: 10, carlos: 10, otro: 4 },
    });
  });
  it("suma y resta Sin proveedor sin tocar a los proveedores", async () => {
    const f = await fixture();
    await f.adjust(5, null);
    await f.adjust(-2, null);
    expect(await f.stock()).toEqual({
      quantity: 23,
      unassigned: 3,
      suppliers: { juan: 10, carlos: 10 },
    });
  });
  it("deja el ajuste en el historial del lote con su motivo", async () => {
    const f = await fixture();
    await f.adjust(4, f.carlos!.id);
    await f.adjust(-1, f.juan!.id);
    const { adjustments, suppliers } = await f.history();
    expect(adjustments.map((row) => row.supplierId)).toEqual(
      expect.arrayContaining([f.carlos!.id, f.juan!.id]),
    );
    expect(suppliers.map((row) => row.name).sort()).toEqual(["carlos", "juan"]);
    expect(
      adjustments.map(({ lotId, quantity, reason }) => [
        lotId,
        quantity,
        reason,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [f.lot.id, 4, "Conteo"],
        [f.lot.id, -1, "Conteo"],
      ]),
    );
  });
  it("la devolución queda en el historial con su proveedor y motivo", async () => {
    const f = await fixture();
    await f.giveBack(f.juan!.id, 3);
    const { adjustments, suppliers } = await f.history();
    expect(adjustments).toEqual([
      expect.objectContaining({
        kind: "RETURN",
        lotId: f.lot.id,
        quantity: -3,
        reason: "Vencido",
        supplierId: f.juan!.id,
      }),
    ]);
    expect(suppliers.map((row) => row.name)).toContain("juan");
  });
  it("un ajuste con costo actualiza el lote y queda en el historial", async () => {
    const f = await fixture();
    await f.adjust(4, f.carlos!.id, undefined, 2500);
    const saved = await first.productLot.findUniqueOrThrow({
      where: { id: f.lot.id },
    });
    expect(saved.unitCostMinor).toBe(2500n);
    const { adjustments, products } = await f.history();
    expect(adjustments[0]?.unitCostMinor).toBe("2500");
    expect(products[0]?.unitCostMinor).toBe("2500");
  });
  it("un ajuste sin costo no cambia el costo del lote", async () => {
    const f = await fixture();
    await f.adjust(4, f.carlos!.id);
    const saved = await first.productLot.findUniqueOrThrow({
      where: { id: f.lot.id },
    });
    expect(saved.unitCostMinor).toBe(100n);
    expect((await f.history()).adjustments[0]?.unitCostMinor).toBeNull();
  });
  it("no acepta costo al restar", async () => {
    const f = await fixture();
    await expect(f.adjust(-1, f.carlos!.id, undefined, 2500)).rejects.toThrow(
      "solo se indica al sumar",
    );
    expect((await f.stock()).quantity).toBe(20);
  });
  it("no resta más de lo que tiene ese proveedor", async () => {
    const f = await fixture();
    await expect(f.adjust(-11, f.juan!.id)).rejects.toThrow(
      "Ese proveedor tiene 10 un.",
    );
    await expect(f.adjust(-1, f.otro!.id)).rejects.toThrow(
      "Ese proveedor tiene 0 un.",
    );
    await expect(f.adjust(-1, null)).rejects.toThrow("Sin proveedor hay 0 un.");
    expect((await f.stock()).quantity).toBe(20);
  });
  it("con varios orígenes exige elegir al restar", async () => {
    const f = await fixture();
    await expect(f.adjust(-1)).rejects.toThrow("Elegí de cuál");
  });
  it("sin proveedor indicado y con un solo origen mantiene el ajuste anterior", async () => {
    const f = await fixture();
    await f.adjust(-10, f.juan!.id);
    await f.adjust(-1);
    expect(await f.stock()).toEqual({
      quantity: 9,
      unassigned: 0,
      suppliers: { juan: 0, carlos: 9 },
    });
  });
  it("un ajuste espera al otro y no supera lo del proveedor", async () => {
    const f = await fixture();
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let markLocked = () => {};
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    // Deja el primer ajuste sin confirmar: sin bloqueo, el segundo calcularía
    // con las unidades de antes y le sacaría al proveedor más de lo que tiene.
    const holder = first.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProductLot" WHERE id=${f.lot.id}::uuid FOR UPDATE`;
        await tx.productLot.update({
          where: { id: f.lot.id },
          data: { quantity: { decrement: 6 } },
        });
        await tx.inventoryMovement.create({
          data: {
            ...f.scope,
            productId: f.lot.productId,
            lotId: f.lot.id,
            type: "ADJUSTMENT_OUT",
            quantity: -6,
            referenceType: SUPPLIER_ADJUSTMENT,
            supplierId: f.juan!.id,
          },
        });
        markLocked();
        await gate;
      },
      { timeout: 20000 },
    );
    await locked;
    const attempt = f.adjust(-6, f.juan!.id, f.other).then(
      () => "ajustó",
      (cause: Error) => cause.message,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await holder;
    await expect(attempt).resolves.toContain("Ese proveedor tiene 4 un.");
    expect((await f.stock()).suppliers).toEqual({ juan: 4, carlos: 10 });
  });
});
