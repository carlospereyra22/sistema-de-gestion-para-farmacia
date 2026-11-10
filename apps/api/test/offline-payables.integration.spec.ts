import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import type { EnvironmentService } from "../src/config/environment.service";
import { AuditService } from "../src/audit/audit.service";
import { PartiesService } from "../src/parties/parties.service";
import type { OperacionProveedorSinConexion } from "../src/parties/proveedor-sin-conexion";
import { SupplierPayablesService } from "../src/supplier-payables/supplier-payables.service";
import type { OperacionPagarSinConexion } from "../src/supplier-payables/pagar-sin-conexion";
import { payableToday } from "../src/supplier-payables/payable-rules";

const MINUTO = 60 * 1000;
/** La operación sin la PC (la pone el test); distributiva sobre la unión. */
type SinPc<T> = T extends unknown ? Omit<T, "deviceId"> : never;

// SISTEMA-73: proveedores y cuentas por pagar sin conexión. Lo hecho sin
// internet llega con su hora real, una sola vez, y lo que chocó con otra PC
// queda como aviso; una deuda exactamente repetida se rechaza.
describe("proveedores y cuentas por pagar sin conexión (esquema aislado)", () => {
  let app: TestingModule;
  let db: PrismaService;
  const schema = `offline_payables_${randomUUID().replaceAll("-", "")}`;
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
    if (app && /^offline_payables_[a-f0-9]{32}$/.test(schema))
      await app
        .get(PrismaService)
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
  });

  const hace = (minutos: number) =>
    new Date(Date.now() - minutos * MINUTO).toISOString();
  const hoy = payableToday();

  async function fixture() {
    const org = await db.organization.create({
      data: { name: "Pagar sin conexión" },
    });
    const branch = await db.branch.create({
      data: { organizationId: org.id, name: "Central", code: "CEN" },
    });
    const user = await db.user.create({
      data: { email: `${randomUUID()}@example.invalid`, passwordHash: "x" },
    });
    const codes = [
      "PARTY_READ",
      "PARTY_MANAGE",
      "PAYABLE_READ",
      "PAYABLE_MANAGE",
      "PAYABLE_PAY",
    ];
    const permissions = await Promise.all(
      codes.map((code) =>
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
        code: "ADMIN",
        name: "Admin",
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
    const audit = new AuditService(db);
    const parties = new PartiesService(db);
    const payables = new SupplierPayablesService(db, audit);
    const proveedor = (op: SinPc<OperacionProveedorSinConexion>) =>
      parties.supplierOffline(user.id, org.id, branch.id, {
        ...op,
        deviceId: randomUUID(),
      } as OperacionProveedorSinConexion);
    const pagar = (op: SinPc<OperacionPagarSinConexion>) =>
      payables.completeOffline(user.id, org.id, branch.id, {
        ...op,
        deviceId: randomUUID(),
      } as OperacionPagarSinConexion);
    const deuda = (
      supplierId: string,
      importe: string,
      extra: Partial<{
        documentType: string;
        pointOfSale: string;
        documentNumber: string;
      }> = {},
    ) => {
      const operationId = randomUUID();
      return {
        operationId,
        supplierId,
        documentType: "FACTURA_C",
        pointOfSale: "",
        documentNumber: "",
        issuedOn: hoy,
        amountMinor: importe,
        dues: [{ dueOn: null, amountMinor: importe }],
        ...extra,
      };
    };
    const pago = (importe: string, saldo: string) => ({
      operationId: randomUUID(),
      amountMinor: importe,
      expectedBalanceMinor: saldo,
      paidOn: hoy,
      method: "TRANSFER",
    });
    const proveedorConConexion = (name: string) =>
      parties.create(user.id, org.id, "suppliers", name);
    return {
      org,
      branch,
      user,
      parties,
      payables,
      proveedor,
      pagar,
      deuda,
      pago,
      proveedorConConexion,
    };
  }

  it("el proveedor dado de alta sin conexión se usa enseguida para cargar y pagar su deuda", async () => {
    const f = await fixture();
    const alta = randomUUID();
    const occurredAt = hace(40);
    await f.proveedor({
      tipo: "ALTA",
      clientOperationId: alta,
      occurredAt,
      cuerpo: {
        name: "Droguería del Sur",
        phone: "351 555-1234",
        accountEnabled: true,
        accountTermDays: 30,
      },
    });
    const supplier = await db.supplier.findUniqueOrThrow({
      where: { id: alta },
    });
    expect(supplier).toMatchObject({
      name: "Droguería del Sur",
      accountEnabled: true,
      accountTermDays: 30,
    });
    expect(supplier.createdAt.toISOString()).toBe(occurredAt);
    // Reenviar la misma alta no la duplica; el mismo id con otros datos es 409.
    await f.proveedor({
      tipo: "ALTA",
      clientOperationId: alta,
      occurredAt,
      cuerpo: {
        name: "Droguería del Sur",
        phone: "351 555-1234",
        accountEnabled: true,
        accountTermDays: 30,
      },
    });
    await expect(
      f.proveedor({
        tipo: "ALTA",
        clientOperationId: alta,
        occurredAt,
        cuerpo: { name: "Otro nombre" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.supplier.count({ where: { organizationId: f.org.id } }),
    ).toBe(1);

    const cuerpo = f.deuda(alta, "50000");
    const cargadaEl = hace(30);
    await f.pagar({
      tipo: "DEUDA",
      clientOperationId: cuerpo.operationId,
      occurredAt: cargadaEl,
      cuerpo,
    });
    const invoice = await db.supplierPayableInvoice.findUniqueOrThrow({
      where: { id: cuerpo.operationId },
    });
    expect(invoice.amountMinor).toBe(50000n);
    expect(invoice.createdAt.toISOString()).toBe(cargadaEl);

    // El pago nombra la deuda por su clave y queda con el id de la PC.
    const pagoSinConexion = f.pago("20000", "50000");
    const respuesta = await f.pagar({
      tipo: "PAGO",
      clientOperationId: pagoSinConexion.operationId,
      occurredAt: hace(20),
      invoiceId: cuerpo.operationId,
      cuerpo: pagoSinConexion,
    });
    expect(respuesta.offlineIssues).toHaveLength(0);
    const detalle = await f.payables.detail(
      f.user.id,
      f.org.id,
      f.branch.id,
      invoice.id,
    );
    expect(detalle.balanceMinor).toBe("30000");
    expect(detalle.payments[0]!.id).toBe(pagoSinConexion.operationId);

    // Anular sin conexión, nombrando el pago por su clave.
    const anular = randomUUID();
    await f.pagar({
      tipo: "ANULAR",
      clientOperationId: anular,
      occurredAt: hace(10),
      invoiceId: cuerpo.operationId,
      paymentId: pagoSinConexion.operationId,
      cuerpo: { reason: "Cargado por error" },
    });
    const anulado = await f.payables.detail(
      f.user.id,
      f.org.id,
      f.branch.id,
      invoice.id,
    );
    expect(anulado.balanceMinor).toBe("50000");
    expect(anulado.payments[0]!.voidReason).toBe("Cargado por error");
    // Anular otra vez (otra PC) no hace nada y avisa.
    const otraVez = await f.pagar({
      tipo: "ANULAR",
      clientOperationId: randomUUID(),
      occurredAt: hace(5),
      invoiceId: invoice.id,
      paymentId: pagoSinConexion.operationId,
      cuerpo: { reason: "Otra PC" },
    });
    expect(otraVez.offlineIssues.map((i) => i.kind)).toEqual([
      "PAGO_YA_ANULADO",
    ]);
  });

  it("un pago mayor al saldo se registra hasta el saldo y avisa lo que sobra", async () => {
    const f = await fixture();
    const supplier = await f.proveedorConConexion("Laboratorio Norte");
    const cuerpo = f.deuda(supplier.id, "10000");
    const { id } = await f.payables.create(
      f.user.id,
      f.org.id,
      f.branch.id,
      cuerpo,
    );
    // Otra PC pagó 7000 con conexión mientras esta PC no tenía internet.
    await f.payables.pay(
      f.user.id,
      f.org.id,
      f.branch.id,
      id,
      f.pago("7000", "10000"),
    );
    const parcial = f.pago("5000", "10000");
    const resultado = await f.pagar({
      tipo: "PAGO",
      clientOperationId: parcial.operationId,
      occurredAt: hace(15),
      invoiceId: id,
      cuerpo: parcial,
    });
    expect(resultado.offlineIssues.map((i) => i.kind)).toEqual([
      "PAGO_SUPERA_SALDO",
    ]);
    expect(resultado.offlineIssues[0]!.detail).toMatchObject({
      registradoMinor: "3000",
      sobraMinor: "2000",
    });
    const detalle = await f.payables.detail(
      f.user.id,
      f.org.id,
      f.branch.id,
      id,
    );
    expect(detalle.balanceMinor).toBe("0");
    // El pago sin conexión queda con su hora real: antes que el de la otra PC.
    expect(detalle.payments.map((p) => p.amountMinor)).toEqual([
      "3000",
      "7000",
    ]);

    // Ya saldada: no se registra nada y queda el aviso.
    const sobrante = f.pago("1000", "3000");
    const nada = await f.pagar({
      tipo: "PAGO",
      clientOperationId: sobrante.operationId,
      occurredAt: hace(10),
      invoiceId: id,
      cuerpo: sobrante,
    });
    expect(nada.offlineIssues.map((i) => i.kind)).toEqual([
      "PAGO_SUPERA_SALDO",
    ]);
    expect(
      await db.supplierPayablePayment.count({ where: { invoiceId: id } }),
    ).toBe(2);
  });

  it("una deuda exactamente repetida se rechaza; si cambia algo se registra con aviso", async () => {
    const f = await fixture();
    const supplier = await f.proveedorConConexion("Distribuidora Centro");
    const comprobante = { pointOfSale: "0003", documentNumber: "00001234" };
    await f.payables.create(f.user.id, f.org.id, f.branch.id, {
      ...f.deuda(supplier.id, "80000", comprobante),
    });
    const igual = f.deuda(supplier.id, "80000", {
      pointOfSale: "3",
      documentNumber: "1234",
    });
    await expect(
      f.pagar({
        tipo: "DEUDA",
        clientOperationId: igual.operationId,
        occurredAt: hace(20),
        cuerpo: igual,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      await db.supplierPayableInvoice.count({
        where: { organizationId: f.org.id },
      }),
    ).toBe(1);
    // Un pago sin conexión a la deuda rechazada también se rechaza.
    const huerfano = f.pago("1000", "80000");
    await expect(
      f.pagar({
        tipo: "PAGO",
        clientOperationId: huerfano.operationId,
        occurredAt: hace(15),
        invoiceId: igual.operationId,
        cuerpo: huerfano,
      }),
    ).rejects.toMatchObject({ status: 422 });

    const distinta = f.deuda(supplier.id, "85000", comprobante);
    const resultado = await f.pagar({
      tipo: "DEUDA",
      clientOperationId: distinta.operationId,
      occurredAt: hace(10),
      cuerpo: distinta,
    });
    expect(resultado.offlineIssues.map((i) => i.kind)).toEqual([
      "COMPROBANTE_REPETIDO",
    ]);
    const registrada = await db.supplierPayableInvoice.findUniqueOrThrow({
      where: { id: distinta.operationId },
    });
    expect(registrada).toMatchObject({
      documentKey: null,
      documentNumber: "00001234",
      amountMinor: 85000n,
    });
  });

  it("una deuda para un proveedor dado de baja se registra igual con aviso", async () => {
    const f = await fixture();
    const supplier = await f.proveedorConConexion("Proveedor viejo");
    await f.parties.setSupplierActive(f.user.id, f.org.id, supplier.id, false);
    const cuerpo = f.deuda(supplier.id, "1500");
    const resultado = await f.pagar({
      tipo: "DEUDA",
      clientOperationId: cuerpo.operationId,
      occurredAt: hace(5),
      cuerpo,
    });
    expect(resultado.offlineIssues.map((i) => i.kind)).toEqual([
      "PROVEEDOR_INACTIVO",
    ]);
    expect(
      await db.supplierPayableInvoice.count({
        where: { id: cuerpo.operationId },
      }),
    ).toBe(1);
  });

  it("la edición sin conexión no pisa lo que otra PC cambió después", async () => {
    const f = await fixture();
    const supplier = await f.proveedorConConexion("Farmacéutica Oeste");
    const occurredAt = hace(60);
    // Otra PC, con conexión y después de la edición sin conexión, cambió el teléfono.
    const actual = await db.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
    });
    await f.parties.updateSupplierTerms(f.user.id, f.org.id, supplier.id, {
      phone: "0800-111",
      accountEnabled: false,
      accountTermDays: null,
      expectedUpdatedAt: actual.updatedAt.toISOString(),
    });
    const resultado = await f.proveedor({
      tipo: "EDICION",
      clientOperationId: randomUUID(),
      occurredAt,
      supplierId: supplier.id,
      cuerpo: {
        phone: "0800-999",
        notes: "Entrega los martes",
        accountEnabled: true,
        accountTermDays: 15,
      },
    });
    expect(resultado.offlineIssues.map((i) => i.kind)).toEqual([
      "CONFIGURACION_PISADA",
    ]);
    const editado = await db.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
    });
    expect(editado).toMatchObject({
      phone: "0800-111",
      notes: "Entrega los martes",
      accountEnabled: true,
      accountTermDays: 15,
    });
  });

  it("dar de baja sin conexión se aplica, salvo que otra PC lo haya restaurado después", async () => {
    const f = await fixture();
    const supplier = await f.proveedorConConexion("Insumos Sur");
    await f.proveedor({
      tipo: "ESTADO",
      clientOperationId: randomUUID(),
      occurredAt: hace(30),
      supplierId: supplier.id,
      cuerpo: { active: false },
    });
    expect(
      (await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } }))
        .active,
    ).toBe(false);
    // Otra PC lo restauró con conexión; llega una baja hecha antes sin conexión.
    await f.parties.setSupplierActive(f.user.id, f.org.id, supplier.id, true);
    const vieja = await f.proveedor({
      tipo: "ESTADO",
      clientOperationId: randomUUID(),
      occurredAt: hace(20),
      supplierId: supplier.id,
      cuerpo: { active: false },
    });
    expect(vieja.offlineIssues.map((i) => i.kind)).toEqual([
      "CONFIGURACION_PISADA",
    ]);
    expect(
      (await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } }))
        .active,
    ).toBe(true);
  });
});
