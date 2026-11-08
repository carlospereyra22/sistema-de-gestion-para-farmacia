import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { SalesService } from "../src/sales/sales.service";
import { CashService } from "../src/cash/cash.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { NO_VALIDO_COMO_FACTURA } from "../src/fiscal/factura-diferida";
import { dentroDeLaTransaccion } from "./support/arca-simulada";

const DAY = 24 * 60 * 60 * 1000;

// SISTEMA-65: factura en espera con la caja cerrada y comprobante interno que
// se manda a ARCA después. ARCA nunca contesta: lo que importa es qué se
// intenta enviar y cuándo.
describe("facturar después de la venta (base local con rollback)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Sólo base local de desarrollo");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  async function enRollback(
    caso: (
      tx: Prisma.TransactionClient,
      f: Awaited<ReturnType<typeof fixture>>,
    ) => Promise<void>,
  ) {
    const rollback = new Error("ROLLBACK_FACTURAR_DESPUES");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            await caso(tx, await fixture(tx));
            throw rollback;
          },
          { timeout: 60000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      jest.restoreAllMocks();
    }
  }

  async function fixture(tx: Prisma.TransactionClient) {
    const profile = {
      legalName: "Fixture facturar después",
      cuit: "20247237837",
      vatCondition: "MONOTAX",
      address: "Test",
      city: "Test",
      province: "Test",
      activityStart: "2026-01-01",
      grossIncomeId: "20247237837",
    };
    const org = await tx.organization.create({
      data: { name: "Farmacia facturar después", fiscalProfile: profile },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Central", code: "FDE" },
    });
    const user = await tx.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "not-a-secret",
      },
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: ["SALE_MANAGE", "SALE_READ", "CASH_READ", "CASH_MANAGE"] },
      },
    });
    const role = await tx.role.create({
      data: {
        organizationId: org.id,
        name: "Fixture",
        code: "FDE",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await tx.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        displayName: "Ana",
        roles: { create: { roleId: role.id } },
      },
    });
    await tx.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
    });
    await tx.fiscalPoint.create({
      data: { organizationId: org.id, branchId: branch.id, number: 1 },
    });
    await tx.fiscalCredential.create({
      data: {
        organizationId: org.id,
        representedCuit: profile.cuit,
        holderCuit: profile.cuit,
        encryptedPrivateKey: "mock-not-a-key",
        certificate: "mock-not-a-cert",
        expiresAt: new Date("2099-01-01"),
      },
    });
    const priceList = await tx.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    const product = await tx.product.create({
      data: { organizationId: org.id, name: "Ibuprofeno 400" },
    });
    await tx.productPrice.create({
      data: {
        productId: product.id,
        priceListId: priceList.id,
        amountMinor: 10000n,
      },
    });
    const lot = await tx.productLot.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        productId: product.id,
        number: "L1",
        quantity: 10,
        unitCostMinor: 4000n,
      },
    });
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Caja" },
    });
    const scoped = dentroDeLaTransaccion(tx);
    const organizations = new OrganizationsService(scoped);
    const connection = app.get(ArcaConnectionService);
    const soap = new ArcaSoap();
    // ARCA nunca contesta: sólo se mira si se intentó emitir.
    const arca = jest.spyOn(soap, "call").mockImplementation(async () => {
      throw new Error("ARCA no disponible en el test.");
    });
    const emisiones = () =>
      arca.mock.calls.filter(([, operation]) => operation === "FECAESolicitar")
        .length;
    const fiscal = new FiscalSalesService(
      scoped,
      connection,
      new FiscalTrialService(scoped, organizations, connection, soap),
    );
    const audit = new AuditService(scoped);
    const sales = new SalesService(scoped, audit, fiscal);
    const cash = new CashService(scoped, audit);
    const abrirCaja = () =>
      tx.cashSession.create({
        data: {
          cashRegisterId: register.id,
          openedById: user.id,
          openingAmountMinor: 0n,
        },
      });
    /** Venta en efectivo; sin sesión, el cobro queda pendiente de caja. */
    const vender = (
      documentType: "INTERNAL" | "INVOICE",
      cashSessionId?: string,
    ) =>
      sales.complete(user.id, org.id, branch.id, {
        documentType,
        ...(documentType === "INVOICE" ? { confirmHomologation: true } : {}),
        clientOperationId: randomUUID(),
        items: [{ productId: product.id, quantity: 1, discountMinor: 0 }],
        payments: [{ method: "CASH", amountMinor: 10000, cashSessionId }],
      });
    const mandarAArca = (saleId: string, confirmar = true) =>
      sales.invoiceInternal(user.id, org.id, branch.id, saleId, {
        confirmHomologation: confirmar,
        fiscalOptions: { recipient: "FINAL_CONSUMER", voucherType: 11 },
      });
    const factura = (saleId: string) =>
      tx.fiscalTrial.findUniqueOrThrow({ where: { sourceSaleId: saleId } });
    return {
      org,
      branch,
      user,
      lot,
      sales,
      cash,
      fiscal,
      vender,
      mandarAArca,
      factura,
      abrirCaja,
      emisiones,
    };
  }

  it("factura con la caja cerrada: espera y sale al incorporar el cobro", () =>
    enRollback(async (tx, f) => {
      const venta = await f.vender("INVOICE");
      expect(await f.factura(venta.id)).toMatchObject({
        status: "HELD",
        deferredReason: "CAJA_CERRADA",
        number: null,
        releasedAt: null,
      });
      // Mientras espera, al cliente se le imprime el comprobante interno.
      expect(
        (await f.sales.ticket(f.user.id, f.org.id, f.branch.id, venta.id)).note,
      ).toContain("se emite cuando el cobro entre a una caja");
      // Ni al vender ni al pedirlo a mano se manda a ARCA.
      await f.fiscal.process(f.user.id, f.org.id, f.branch.id, venta.id);
      expect((await f.factura(venta.id)).status).toBe("HELD");
      expect(f.emisiones()).toBe(0);

      const [pendiente] = await f.cash.pendingCollections(
        f.user.id,
        f.org.id,
        f.branch.id,
      );
      expect(pendiente).toMatchObject({
        sourceId: venta.id,
        facturaEnEspera: true,
      });

      const sesion = await f.abrirCaja();
      await expect(
        f.cash.assignCollection(
          f.user.id,
          f.org.id,
          f.branch.id,
          pendiente!.id,
          sesion.id,
        ),
      ).resolves.toMatchObject({ facturaLiberada: true });
      const liberada = await f.factura(venta.id);
      expect(liberada).toMatchObject({
        status: "QUEUED",
        deferredReason: "CAJA_CERRADA",
      });
      expect(liberada.releasedAt).not.toBeNull();
      expect(
        await tx.auditLog.count({
          where: { entityId: liberada.id, action: "LIBERADA" },
        }),
      ).toBe(1);
    }));

  it("con la caja abierta la factura sale en el momento, sin marca", () =>
    enRollback(async (_tx, f) => {
      const venta = await f.vender("INVOICE", (await f.abrirCaja()).id);
      expect(await f.factura(venta.id)).toMatchObject({
        status: "QUEUED",
        deferredReason: null,
      });
    }));

  it("anular una venta con la factura en espera no emite nada", () =>
    enRollback(async (tx, f) => {
      const venta = await f.vender("INVOICE");
      await f.sales.cancel(
        f.user.id,
        f.org.id,
        f.branch.id,
        venta.id,
        "Se arrepintió",
      );
      expect(
        (await tx.sale.findUniqueOrThrow({ where: { id: venta.id } })).status,
      ).toBe("CANCELLED");
      expect((await f.factura(venta.id)).status).toBe("HELD");
      expect(f.emisiones()).toBe(0);
    }));

  it("un comprobante interno se manda a ARCA después, una sola vez", () =>
    enRollback(async (tx, f) => {
      const venta = await f.vender("INTERNAL", (await f.abrirCaja()).id);
      const ticket = await f.sales.ticket(
        f.user.id,
        f.org.id,
        f.branch.id,
        venta.id,
      );
      expect(ticket.note).toBe(NO_VALIDO_COMO_FACTURA);

      const resultado = await f.mandarAArca(venta.id);
      expect(resultado).toMatchObject({
        deferredReason: "COMPROBANTE_INTERNO",
        status: "QUEUED",
      });
      expect(resultado.ticket.note).toContain("Facturada después");
      expect(
        (await tx.sale.findUniqueOrThrow({ where: { id: venta.id } }))
          .documentType,
      ).toBe("INVOICE");
      expect(
        (await f.factura(venta.id)).saleSnapshot as { cashier: string },
      ).toMatchObject({ cashier: "Ana" });
      expect(
        await tx.auditLog.count({
          where: { entityId: venta.id, action: "FACTURADA_DESPUES" },
        }),
      ).toBe(1);

      // El mismo pedido repetido devuelve lo hecho, sin otra factura.
      await expect(f.mandarAArca(venta.id)).resolves.toMatchObject({
        deferredReason: "COMPROBANTE_INTERNO",
      });
      expect(
        await tx.fiscalTrial.count({ where: { sourceSaleId: venta.id } }),
      ).toBe(1);
    }));

  it("un comprobante interno con el cobro sin caja espera la caja", () =>
    enRollback(async (_tx, f) => {
      const venta = await f.vender("INTERNAL");
      await f.mandarAArca(venta.id);
      expect(await f.factura(venta.id)).toMatchObject({
        status: "HELD",
        deferredReason: "COMPROBANTE_INTERNO",
      });
      expect(f.emisiones()).toBe(0);
    }));

  it("no se manda a ARCA sin confirmar, anulada, con devoluciones o pasados 30 días", () =>
    enRollback(async (tx, f) => {
      const sesion = (await f.abrirCaja()).id;
      const sinConfirmar = await f.vender("INTERNAL", sesion);
      await expect(f.mandarAArca(sinConfirmar.id, false)).rejects.toThrow(
        "Confirmá",
      );

      const anulada = await f.vender("INTERNAL", sesion);
      await f.sales.cancel(
        f.user.id,
        f.org.id,
        f.branch.id,
        anulada.id,
        "Error de carga",
      );
      await expect(f.mandarAArca(anulada.id)).rejects.toThrow("anulada");

      const conDevolucion = await f.vender("INTERNAL", sesion);
      const [renglon] = await tx.saleItem.findMany({
        where: { saleId: conDevolucion.id },
      });
      await f.sales.customerReturn(
        f.user.id,
        f.org.id,
        f.branch.id,
        conDevolucion.id,
        {
          reason: "Vencido",
          items: [{ saleItemId: renglon!.id, quantity: 1 }],
        },
      );
      await expect(f.mandarAArca(conDevolucion.id)).rejects.toThrow(
        "devoluciones",
      );

      const vieja = await f.vender("INTERNAL", sesion);
      await tx.sale.update({
        where: { id: vieja.id },
        data: { completedAt: new Date(Date.now() - 31 * DAY) },
      });
      await expect(f.mandarAArca(vieja.id)).rejects.toThrow("más de 30 días");
      expect(
        await tx.fiscalTrial.count({ where: { organizationId: f.org.id } }),
      ).toBe(0);
    }));
});
