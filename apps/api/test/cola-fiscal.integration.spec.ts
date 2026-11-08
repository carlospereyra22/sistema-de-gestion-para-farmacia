import { randomUUID } from "node:crypto";
import { BadGatewayException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { SalesService } from "../src/sales/sales.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import { ProductionConfigurationService } from "../src/fiscal/production-configuration.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { CredentialVault } from "../src/fiscal/credential-vault";
import { ColaFiscalService } from "../src/fiscal/cola-fiscal.service";
import {
  arcaSimulada,
  dentroDeLaTransaccion,
  envejecer,
} from "./support/arca-simulada";

const minuto = 60_000;

describe("cola fiscal (base local con rollback, ARCA simulada)", () => {
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

  it("envía sola lo que quedó en cola, en orden, sin ventas anuladas, y espera entre reintentos", async () => {
    const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    const rollback = new Error("ROLLBACK_COLA_FISCAL");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            const profile = {
              legalName: "Fixture cola",
              cuit: "20247237837",
              vatCondition: "MONOTAX",
              address: "Test",
              city: "Test",
              province: "Test",
              activityStart: "2026-01-01",
              grossIncomeId: "20247237837",
            };
            const org = await tx.organization.create({
              data: { name: "Farmacia cola", fiscalProfile: profile },
            });
            const branch = await tx.branch.create({
              data: { organizationId: org.id, name: "Central", code: "Q" },
            });
            const user = await tx.user.create({
              data: {
                email: `${randomUUID()}@example.invalid`,
                passwordHash: "not-a-secret",
              },
            });
            const permissions = await tx.permission.findMany({
              where: {
                code: { in: ["SALE_MANAGE", "SALE_READ", "CASH_READ"] },
              },
            });
            const role = await tx.role.create({
              data: {
                organizationId: org.id,
                name: "Fixture",
                code: "Q",
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
            await tx.fiscalCredential.create({
              data: {
                organizationId: org.id,
                environment: "PRODUCTION",
                holderCuit: profile.cuit,
                representedCuit: profile.cuit,
                encryptedPrivateKey: "fixture-not-key",
                certificate: "fixture-not-cert",
                expiresAt: new Date("2099-01-01"),
                verifiedAt: new Date(),
              },
            });
            await tx.fiscalProductionConfiguration.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                point: 99996,
                issuerCuit: profile.cuit,
                credentialVersion: 1,
                enabled: true,
                exclusiveConfirmed: true,
                activatedAt: new Date(),
              },
            });
            const product = await tx.product.create({
              data: { organizationId: org.id, name: "Producto" },
            });
            const priceList = await tx.priceList.create({
              data: { organizationId: org.id, name: "Precio general" },
            });
            await tx.productPrice.create({
              data: {
                productId: product.id,
                priceListId: priceList.id,
                amountMinor: 10000n,
              },
            });
            await tx.productLot.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                productId: product.id,
                number: "Q",
                quantity: 50,
                unitCostMinor: 4000n,
              },
            });
            const scoped = dentroDeLaTransaccion(tx);
            const organizations = new OrganizationsService(scoped);
            const vault = app.get(CredentialVault);
            jest.spyOn(vault, "provider").mockReturnValue("AES256_GCM");
            const connection = app.get(ArcaConnectionService);
            const access = jest.spyOn(connection, "access").mockResolvedValue({
              environment: "PRODUCTION",
              token: "fixture",
              sign: "fixture",
              cuit: profile.cuit,
              version: 1,
            });
            let arcaCaida = false;
            jest.spyOn(connection, "points").mockImplementation(async () => {
              if (arcaCaida)
                throw new BadGatewayException("ARCA no responde (simulado).");
              return [
                {
                  number: 99996,
                  type: "CAE - Monotributo",
                  blocked: "N",
                  closed: "",
                },
              ];
            });
            const config = new ProductionConfigurationService(
              scoped,
              organizations,
              connection,
              vault,
            );
            const soap = new ArcaSoap();
            const arca = arcaSimulada(profile.cuit, 99996);
            jest.spyOn(soap, "call").mockImplementation(arca.call);
            const production = new ProductionSalesService(
              scoped,
              config,
              connection,
              soap,
              organizations,
            );
            const trials = new FiscalTrialService(
              scoped,
              organizations,
              connection,
              soap,
            );
            const fiscal = new FiscalSalesService(scoped, connection, trials);
            const sales = new SalesService(
              scoped,
              new AuditService(scoped),
              fiscal,
              production,
              config,
            );
            const cola = new ColaFiscalService(scoped, production, fiscal);
            let reloj = Date.now();
            const vuelta = (masMinutos: number) => {
              reloj += masMinutos * minuto;
              return cola.procesarPendientes({
                organizationId: org.id,
                ahora: () => reloj,
              });
            };
            // Con la caja abierta la factura va a la cola en el momento (sin
            // caja espera a que se incorpore el cobro: SISTEMA-65).
            const caja = await tx.cashRegister.create({
              data: { branchId: branch.id, name: "Caja" },
            });
            const sesion = await tx.cashSession.create({
              data: {
                cashRegisterId: caja.id,
                openedById: user.id,
                openingAmountMinor: 0n,
              },
            });
            const vender = () =>
              sales.complete(user.id, org.id, branch.id, {
                documentType: "INVOICE",
                fiscalEnvironment: "PRODUCTION",
                confirmProduction: true,
                clientOperationId: randomUUID(),
                fiscalOptions: { recipient: "FINAL_CONSUMER", voucherType: 11 },
                items: [
                  { productId: product.id, quantity: 1, discountMinor: 0 },
                ],
                payments: [
                  {
                    method: "CASH",
                    amountMinor: 10000,
                    cashSessionId: sesion.id,
                  },
                ],
              });
            const factura = (saleId: string) =>
              tx.fiscalDocument.findFirstOrThrow({
                where: { sourceSaleId: saleId, kind: "INVOICE" },
              });

            // ARCA caída al vender: las tres facturas quedan en cola.
            arcaCaida = true;
            const a = await vender();
            const b = await vender();
            const c = await vender();
            for (const venta of [a, b, c])
              expect((await factura(venta.id)).status).toBe("QUEUED");
            await sales.cancel(user.id, org.id, branch.id, b.id, "Error");
            arcaCaida = false;

            // La venta recién hecha tiene un minuto para enviar su factura.
            expect((await vuelta(0)).intentados).toBe(0);

            // Pasado ese minuto, la cola envía en orden y salta la anulada.
            access.mockClear();
            const primera = await vuelta(2);
            expect(primera).toMatchObject({ intentados: 2, autorizados: 2 });
            expect((await factura(a.id)).number).toBe(1);
            expect((await factura(c.id)).number).toBe(2);
            expect((await factura(b.id)).status).toBe("QUEUED");
            // Sin usuario: nunca se pidió acceso con un id de usuario.
            expect(
              access.mock.calls.every((call) => typeof call[0] === "symbol"),
            ).toBe(true);
            const auditoria = await tx.auditLog.findFirstOrThrow({
              where: {
                entityId: (await factura(a.id)).id,
                action: "AUTHORIZED",
              },
            });
            expect(auditoria.actorId).toBeNull();
            expect(auditoria.after).toMatchObject({ origen: "AUTOMATICO" });

            // Si falla, espera cinco minutos antes de volver a intentar.
            arcaCaida = true;
            const d = await vender();
            expect(await vuelta(2)).toMatchObject({
              intentados: 1,
              fallidos: 1,
            });
            arcaCaida = false;
            expect((await vuelta(3)).intentados).toBe(0);
            expect(await vuelta(3)).toMatchObject({
              intentados: 1,
              autorizados: 1,
            });
            expect((await factura(d.id)).number).toBe(3);

            // Una factura sin confirmar traba el punto hasta resolverse.
            arca.estado.envio = "no-llega";
            const e = await vender();
            expect((await factura(e.id)).status).toBe("UNCERTAIN");
            arca.estado.envio = "ok";
            arcaCaida = true;
            const f = await vender();
            arcaCaida = false;
            expect(await vuelta(2)).toMatchObject({
              intentados: 1,
              sinConfirmar: 1,
            });
            expect((await factura(f.id)).status).toBe("QUEUED");
            // Pasada la espera de ARCA, se libera y sale la siguiente.
            await envejecer(tx, "FiscalDocument", (await factura(e.id)).id);
            expect(await vuelta(6)).toMatchObject({
              intentados: 2,
              rechazados: 1,
              autorizados: 1,
            });
            expect((await factura(e.id)).detail).toContain("No llegó a ARCA");
            expect((await factura(f.id)).status).toBe("AUTHORIZED");

            // Homologación: la factura de prueba de una venta también sale sola.
            access.mockResolvedValue({
              token: "fixture",
              sign: "fixture",
              cuit: profile.cuit,
              version: 1,
            });
            const venta = await tx.sale.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                status: "COMPLETED",
                documentType: "INVOICE",
                totalMinor: 10000n,
                completedAt: new Date(),
              },
            });
            const prueba = await tx.fiscalTrial.create({
              data: {
                organizationId: org.id,
                requestId: venta.id,
                sourceSaleId: venta.id,
                status: "QUEUED",
                point: 99996,
                voucherType: 11,
                date: "20261107",
                totalMinor: 10000,
                issuer: { ...profile },
              },
            });
            await tx.$executeRaw`UPDATE "FiscalTrial" SET "createdAt" = now() - interval '5 minutes' WHERE id = ${prueba.id}::uuid`;
            delete process.env.FISCAL_PRODUCTION_ISSUANCE;
            expect(await vuelta(1)).toMatchObject({
              intentados: 1,
              autorizados: 1,
            });
            expect(
              (
                await tx.fiscalTrial.findUniqueOrThrow({
                  where: { id: prueba.id },
                })
              ).status,
            ).toBe("AUTHORIZED");
            throw rollback;
          },
          { timeout: 90000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      if (previous === undefined) delete process.env.FISCAL_PRODUCTION_ISSUANCE;
      else process.env.FISCAL_PRODUCTION_ISSUANCE = previous;
      jest.restoreAllMocks();
    }
  }, 100000);
});
