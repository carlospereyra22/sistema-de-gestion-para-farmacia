import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import {
  SalesService,
  type OfflineSaleInput,
} from "../src/sales/sales.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import { ProductionConfigurationService } from "../src/fiscal/production-configuration.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { CredentialVault } from "../src/fiscal/credential-vault";
import { commercialToday } from "../src/platform/subscription-access";
import { dentroDeLaTransaccion } from "./support/arca-simulada";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("ventas hechas sin conexión (base local con rollback)", () => {
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

  /** Corre el caso dentro de una transacción que siempre se deshace. */
  async function enRollback(
    caso: (
      tx: Prisma.TransactionClient,
      f: Awaited<ReturnType<typeof fixture>>,
    ) => Promise<void>,
  ) {
    const rollback = new Error("ROLLBACK_OFFLINE_SALES");
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
      legalName: "Fixture sin conexión",
      cuit: "20247237837",
      vatCondition: "MONOTAX",
      address: "Test",
      city: "Test",
      province: "Test",
      activityStart: "2026-01-01",
      grossIncomeId: "20247237837",
    };
    const org = await tx.organization.create({
      data: { name: "Farmacia sin conexión", fiscalProfile: profile },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Central", code: "OFF" },
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
        code: "OFF",
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await tx.userOrganization.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        roles: { create: { roleId: role.id } },
      },
    });
    await tx.userBranch.create({
      data: { userId: user.id, branchId: branch.id },
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
        quantity: 2,
        unitCostMinor: 4000n,
      },
    });
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Caja" },
    });
    const session = await tx.cashSession.create({
      data: {
        cashRegisterId: register.id,
        openedById: user.id,
        openingAmountMinor: 0n,
        openedAt: new Date(Date.now() - 2 * HOUR),
      },
    });
    const scoped = dentroDeLaTransaccion(tx);
    const organizations = new OrganizationsService(scoped);
    const connection = app.get(ArcaConnectionService);
    const vault = app.get(CredentialVault);
    const config = new ProductionConfigurationService(
      scoped,
      organizations,
      connection,
      vault,
    );
    const soap = new ArcaSoap();
    const arca = jest.spyOn(soap, "call").mockImplementation(async () => {
      throw new Error("Sin conexión no se habla con ARCA al sincronizar.");
    });
    const production = new ProductionSalesService(
      scoped,
      config,
      connection,
      soap,
      organizations,
    );
    const fiscal = new FiscalSalesService(
      scoped,
      connection,
      new FiscalTrialService(scoped, organizations, connection, soap),
    );
    const sales = new SalesService(
      scoped,
      new AuditService(scoped),
      fiscal,
      production,
      config,
    );
    const sale = (
      overrides: Partial<OfflineSaleInput> = {},
    ): OfflineSaleInput => ({
      clientOperationId: randomUUID(),
      occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      deviceId: randomUUID(),
      items: [
        {
          productId: product.id,
          quantity: 1,
          discountMinor: 0,
          expectedUnitPriceMinor: "10000",
          productName: "Ibuprofeno 400",
        },
      ],
      payments: [
        { method: "CASH", amountMinor: 10000, cashSessionId: session.id },
      ],
      ...overrides,
    });
    const offline = (input: OfflineSaleInput) =>
      sales.completeOffline(user.id, org.id, branch.id, input);
    return {
      profile,
      org,
      branch,
      user,
      priceList,
      product,
      lot,
      session,
      sales,
      sale,
      offline,
      arca,
      vault,
      connection,
    };
  }

  const lotQuantity = (tx: Prisma.TransactionClient, id: string) =>
    tx.productLot
      .findUniqueOrThrow({ where: { id } })
      .then((lot) => lot.quantity);

  it("registra con la fecha real y el id de la PC, sin duplicar", () =>
    enRollback(async (tx, f) => {
      const input = f.sale();
      const first = await f.offline(input);
      expect(first.id).toBe(input.clientOperationId);
      expect(new Date(first.completedAt!).toISOString()).toBe(input.occurredAt);
      expect(first.offlineIssues).toEqual([]);
      expect(await lotQuantity(tx, f.lot.id)).toBe(1);
      const movement = await tx.inventoryMovement.findFirstOrThrow({
        where: { referenceId: first.id, type: "SALE" },
      });
      expect(movement.occurredAt.toISOString()).toBe(input.occurredAt);
      expect(
        await tx.offlineOperation.findUniqueOrThrow({
          where: { id: input.clientOperationId },
        }),
      ).toMatchObject({ kind: "SALE", entityId: first.id });

      // El mismo envío repetido devuelve la venta original.
      expect((await f.offline(input)).id).toBe(first.id);
      expect(await tx.sale.count({ where: { organizationId: f.org.id } })).toBe(
        1,
      );
      expect(await lotQuantity(tx, f.lot.id)).toBe(1);

      // El mismo id con otro contenido es un error de la PC.
      await expect(
        f.offline({
          ...input,
          items: [{ ...input.items[0]!, quantity: 2 }],
        }),
      ).rejects.toThrow("otros datos");

      // Lo que se mandó con conexión (y se registró) no se duplica sin conexión.
      const online = f.sale();
      const registered = await f.sales.complete(
        f.user.id,
        f.org.id,
        f.branch.id,
        online,
      );
      expect((await f.offline(online)).id).toBe(registered.id);
      expect(await tx.sale.count({ where: { organizationId: f.org.id } })).toBe(
        2,
      );
    }));

  it("precio cambiado y dos PCs vendiendo lo mismo: registra con aviso, nunca negativo", () =>
    enRollback(async (tx, f) => {
      await tx.productPrice.update({
        where: {
          productId_priceListId: {
            productId: f.product.id,
            priceListId: f.priceList.id,
          },
        },
        data: { amountMinor: 12000n },
      });
      const dos = {
        items: [
          {
            productId: f.product.id,
            quantity: 2,
            discountMinor: 0,
            expectedUnitPriceMinor: "10000",
          },
        ],
        payments: [
          {
            method: "CASH" as const,
            amountMinor: 20000,
            cashSessionId: f.session.id,
          },
        ],
      };
      const pc1 = await f.offline(f.sale(dos));
      expect(pc1.totalMinor).toBe("20000");
      expect(pc1.offlineIssues.map((issue) => issue.kind)).toEqual([
        "PRECIO_DISTINTO",
      ]);
      expect(await lotQuantity(tx, f.lot.id)).toBe(0);

      const pc2 = await f.offline(f.sale(dos));
      expect(pc2.totalMinor).toBe("20000");
      expect(pc2.offlineIssues.map((issue) => issue.kind).sort()).toEqual([
        "PRECIO_DISTINTO",
        "STOCK_FALTANTE",
      ]);
      expect(
        pc2.offlineIssues.find((issue) => issue.kind === "STOCK_FALTANTE")
          ?.detail,
      ).toMatchObject({ faltantes: 2 });
      const faltante = await tx.saleItem.findFirstOrThrow({
        where: { saleId: pc2.id },
      });
      expect(faltante).toMatchObject({ lotId: null, quantity: 2 });
      const minimo = await tx.productLot.aggregate({
        where: { organizationId: f.org.id },
        _min: { quantity: true },
      });
      expect(minimo._min.quantity).toBe(0);

      // Anular el faltante no repone lo que nunca se descontó, y cierra sus
      // avisos: ya no hay nada que revisar.
      await f.sales.cancel(f.user.id, f.org.id, f.branch.id, pc2.id, "Prueba");
      expect(await lotQuantity(tx, f.lot.id)).toBe(0);
      expect(
        await tx.offlineSyncIssue.findMany({
          where: { saleId: pc2.id },
          select: { status: true, resolutionNote: true },
        }),
      ).toEqual([
        { status: "RESOLVED", resolutionNote: "Venta anulada" },
        { status: "RESOLVED", resolutionNote: "Venta anulada" },
      ]);
      expect(
        await tx.offlineSyncIssue.count({
          where: { saleId: pc1.id, status: "OPEN" },
        }),
      ).toBe(1);
      await f.sales.cancel(f.user.id, f.org.id, f.branch.id, pc1.id, "Prueba");
      expect(await lotQuantity(tx, f.lot.id)).toBe(2);
    }));

  it("producto archivado, caja cerrada y límite de crédito: registra con aviso", () =>
    enRollback(async (tx, f) => {
      await tx.product.update({
        where: { id: f.product.id },
        data: { active: false },
      });
      const archivado = await f.offline(f.sale());
      expect(archivado.offlineIssues.map((issue) => issue.kind)).toEqual([
        "PRODUCTO_NO_DISPONIBLE",
      ]);
      expect(
        await tx.saleItem.findFirstOrThrow({ where: { saleId: archivado.id } }),
      ).toMatchObject({
        productId: null,
        lotId: null,
        description: "Ibuprofeno 400",
      });
      expect(await lotQuantity(tx, f.lot.id)).toBe(2);
      await tx.product.update({
        where: { id: f.product.id },
        data: { active: true },
      });

      await tx.cashSession.update({
        where: { id: f.session.id },
        data: { closedAt: new Date(), closingAmountMinor: 0n },
      });
      const cerrada = f.sale();
      const sinCaja = await f.offline(cerrada);
      expect(sinCaja.offlineIssues.map((issue) => issue.kind)).toEqual([
        "CAJA_CERRADA",
      ]);
      const pendiente = await tx.cashPendingCollection.findFirstOrThrow({
        where: { sourceId: sinCaja.id, sourceType: "SALE" },
      });
      expect(pendiente.cashMinor).toBe(10000n);
      expect(pendiente.collectedAt.toISOString()).toBe(cerrada.occurredAt);
      expect(
        await tx.salePayment.findFirstOrThrow({
          where: { saleId: sinCaja.id },
        }),
      ).toMatchObject({ cashSessionId: null });

      const customer = await tx.customer.create({
        data: {
          organizationId: f.org.id,
          name: "Cliente con límite",
          creditEnabled: true,
          creditLimitMinor: 5000n,
        },
      });
      const aCuenta = f.sale({
        customerId: customer.id,
        payments: [{ method: "ACCOUNT", amountMinor: 10000 }],
      });
      const fiado = await f.offline(aCuenta);
      expect(fiado.offlineIssues.map((issue) => issue.kind)).toEqual([
        "LIMITE_CREDITO",
      ]);
      const deuda = await tx.customerAccountMovement.findFirstOrThrow({
        where: { saleId: fiado.id, type: "DEBIT" },
      });
      expect(deuda.amountMinor).toBe(10000n);
      expect(deuda.createdAt.toISOString()).toBe(aCuenta.occurredAt);
    }));

  it("corte por falta de pago: acepta lo vendido antes del corte y no lo de después", () =>
    enRollback(async (tx, f) => {
      const plan = await tx.subscriptionPlan.create({
        data: { code: `OFF-${randomUUID()}`, name: "Plan fixture" },
      });
      // Pagó hasta hace 15 días: hoy está en solo lectura (corte hace 4 días).
      const today = Date.parse(`${commercialToday(new Date())}T00:00:00.000Z`);
      await tx.organizationSubscription.create({
        data: {
          organizationId: f.org.id,
          planId: plan.id,
          paidThrough: new Date(today - 15 * DAY),
        },
      });
      const antes = await f.offline(
        f.sale({ occurredAt: new Date(Date.now() - 6 * DAY).toISOString() }),
      );
      expect(antes.status).toBe("COMPLETED");
      const despues = f.offline(f.sale());
      await expect(despues).rejects.toBeInstanceOf(HttpException);
      await expect(despues).rejects.toMatchObject({ status: 402 });
    }));

  it("factura pedida sin conexión: a la cola fiscal, o ticket con aviso si no hay facturación", () =>
    enRollback(async (tx, f) => {
      // Sin facturación de prueba configurada: queda como ticket con aviso.
      const sinFacturacion = await f.offline(
        f.sale({
          documentType: "INVOICE",
          fiscalEnvironment: "HOMOLOGATION",
          confirmHomologation: true,
        }),
      );
      expect(sinFacturacion.documentType).toBe("INTERNAL");
      expect(sinFacturacion.offlineIssues.map((issue) => issue.kind)).toEqual([
        "FACTURA_NO_PREPARADA",
      ]);

      // Con producción activa y la emisión apagada: queda en la cola, sin
      // hablar con ARCA al sincronizar.
      jest.spyOn(f.vault, "provider").mockReturnValue("AES256_GCM");
      await tx.fiscalCredential.create({
        data: {
          organizationId: f.org.id,
          environment: "PRODUCTION",
          holderCuit: f.profile.cuit,
          representedCuit: f.profile.cuit,
          encryptedPrivateKey: "fixture-not-key",
          certificate: "fixture-not-cert",
          expiresAt: new Date("2099-01-01"),
          verifiedAt: new Date(),
        },
      });
      await tx.fiscalProductionConfiguration.create({
        data: {
          organizationId: f.org.id,
          branchId: f.branch.id,
          point: 99995,
          issuerCuit: f.profile.cuit,
          credentialVersion: 1,
          enabled: true,
          exclusiveConfirmed: true,
          activatedAt: new Date(),
        },
      });
      const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
      delete process.env.FISCAL_PRODUCTION_ISSUANCE;
      try {
        const conFactura = await f.offline(
          f.sale({
            documentType: "INVOICE",
            fiscalEnvironment: "PRODUCTION",
            confirmProduction: true,
            fiscalOptions: { recipient: "FINAL_CONSUMER", voucherType: 11 },
          }),
        );
        expect(conFactura.offlineIssues).toEqual([]);
        expect(conFactura.documentType).toBe("INVOICE");
        expect(
          await tx.fiscalDocument.findFirstOrThrow({
            where: { sourceSaleId: conFactura.id },
          }),
        ).toMatchObject({ status: "QUEUED", number: null });
        expect(f.arca).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined)
          delete process.env.FISCAL_PRODUCTION_ISSUANCE;
        else process.env.FISCAL_PRODUCTION_ISSUANCE = previous;
      }
    }));

  it("avisos: se listan y se marcan como revisados una sola vez", () =>
    enRollback(async (tx, f) => {
      await tx.productPrice.update({
        where: {
          productId_priceListId: {
            productId: f.product.id,
            priceListId: f.priceList.id,
          },
        },
        data: { amountMinor: 11000n },
      });
      const venta = await f.offline(f.sale());
      const abiertos = await f.sales.offlineIssues(
        f.user.id,
        f.org.id,
        f.branch.id,
      );
      expect(abiertos).toHaveLength(1);
      expect(abiertos[0]).toMatchObject({
        kind: "PRECIO_DISTINTO",
        saleId: venta.id,
        status: "OPEN",
      });
      const revisado = await f.sales.resolveOfflineIssue(
        f.user.id,
        f.org.id,
        f.branch.id,
        abiertos[0]!.id,
        "Se cobró con el precio anterior, está bien.",
      );
      expect(revisado.status).toBe("RESOLVED");
      await expect(
        f.sales.resolveOfflineIssue(
          f.user.id,
          f.org.id,
          f.branch.id,
          abiertos[0]!.id,
        ),
      ).rejects.toThrow("ya estaba revisado");
      expect(
        await f.sales.offlineIssues(f.user.id, f.org.id, f.branch.id),
      ).toHaveLength(0);
      expect(
        await f.sales.offlineIssues(f.user.id, f.org.id, f.branch.id, true),
      ).toHaveLength(1);
    }));

  it("otro usuario de la PC manda la venta firmada y queda a nombre de quien la hizo", () =>
    enRollback(async (tx, f) => {
      // Beto, cajero del turno siguiente en la misma PC y sucursal.
      const beto = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          passwordHash: "not-a-secret",
        },
      });
      const rol = await tx.userOrganizationRole.findFirstOrThrow({
        where: { membership: { userId: f.user.id } },
      });
      await tx.userOrganization.create({
        data: {
          organizationId: f.org.id,
          userId: beto.id,
          roles: { create: { roleId: rol.roleId } },
        },
      });
      await tx.userBranch.create({
        data: { userId: beto.id, branchId: f.branch.id },
      });
      // Clave de Ana en esa PC, registrada al entrar con conexión.
      const { publicKey, privateKey } = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });
      const venta = f.sale();
      await tx.offlineDeviceKey.create({
        data: {
          userId: f.user.id,
          deviceId: venta.deviceId,
          publicKey: publicKey
            .export({ format: "der", type: "spki" })
            .toString("base64"),
        },
      });
      const payload = JSON.stringify(venta);
      const firmar = (key: typeof privateKey, texto: string) =>
        sign("sha256", Buffer.from(texto), {
          key,
          dsaEncoding: "ieee-p1363",
        }).toString("base64");
      const enviarComoBeto = (firma: string, texto = payload) =>
        f.sales.completeOfflineSigned(
          beto.id,
          f.org.id,
          f.branch.id,
          {
            sellerId: f.user.id,
            deviceId: venta.deviceId,
            payload: texto,
            signature: firma,
          },
          JSON.parse(texto),
        );

      // Beto no puede cargar ventas a nombre de Ana con su propia clave ni
      // cambiando lo que Ana firmó.
      const otra = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      await expect(
        enviarComoBeto(firmar(otra.privateKey, payload)),
      ).rejects.toThrow("firma");
      await expect(
        enviarComoBeto(
          firmar(privateKey, payload),
          JSON.stringify({
            ...venta,
            items: [{ ...venta.items[0]!, quantity: 2 }],
          }),
        ),
      ).rejects.toThrow("firma");

      const registrada = await enviarComoBeto(firmar(privateKey, payload));
      expect(registrada.id).toBe(venta.clientOperationId);
      const operacion = await tx.offlineOperation.findUniqueOrThrow({
        where: { id: venta.clientOperationId },
      });
      expect(operacion.actorId).toBe(f.user.id);
      expect(
        await tx.auditLog.findFirstOrThrow({
          where: { entityId: registrada.id, action: "SINCRONIZADA_POR_OTRO" },
        }),
      ).toMatchObject({ actorId: beto.id });
      // Reenviarla no la duplica.
      await enviarComoBeto(firmar(privateKey, payload));
      expect(await tx.sale.count({ where: { organizationId: f.org.id } })).toBe(
        1,
      );
    }));
});
