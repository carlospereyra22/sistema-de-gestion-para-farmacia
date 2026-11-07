import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
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

// Simula a ARCA: sólo "existen" los números que llegaron a registrarse.
type Envio = "ok" | "no-llega" | "respuesta-perdida" | "solo-errores";
function arcaSimulada(cuit: string, point: number) {
  const registrados = new Map<number, Map<number, string>>();
  const estado = { envio: "ok" as Envio, emisiones: 0 };
  const valor = (body: string, tag: string) =>
    new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(body)?.[1] ?? "";
  const call = async (_kind: string, operation: string, body: string) => {
    const type = Number(valor(body, "CbteTipo"));
    const porTipo = registrados.get(type) ?? new Map<number, string>();
    registrados.set(type, porTipo);
    if (operation === "FECompUltimoAutorizado")
      return {
        CbteNro: String(Math.max(0, ...porTipo.keys())),
        PtoVta: String(point),
        CbteTipo: String(type),
      };
    if (operation === "FECAESolicitar") {
      const number = Number(valor(body, "CbteDesde"));
      if (estado.envio === "no-llega")
        throw new Error("Se cortó antes de llegar a ARCA");
      if (estado.envio === "solo-errores")
        return {
          Errors: {
            Err: { Code: "600", Msg: "ValidacionDeToken: no validaron" },
          },
        };
      estado.emisiones++;
      porTipo.set(number, body);
      if (estado.envio === "respuesta-perdida")
        throw new Error("ARCA autorizó pero se perdió la respuesta");
      return {
        FeCabResp: {
          Cuit: cuit,
          PtoVta: String(point),
          CbteTipo: String(type),
          CantReg: "1",
          Resultado: "A",
        },
        FeDetResp: {
          FECAEDetResponse: {
            Resultado: "A",
            CbteDesde: String(number),
            CbteHasta: String(number),
            CbteFch: valor(body, "CbteFch"),
            DocTipo: valor(body, "DocTipo"),
            DocNro: valor(body, "DocNro"),
            CAE: "12345678901234",
            CAEFchVto: "20991231",
          },
        },
      };
    }
    if (operation === "FECompConsultar") {
      const number = Number(valor(body, "CbteNro"));
      const enviado = porTipo.get(number);
      if (!enviado)
        return {
          Errors: {
            Err: {
              Code: "602",
              Msg: "No existen datos en nuestros registros para los parametros ingresados.",
            },
          },
        };
      const total = valor(enviado, "ImpTotal");
      return {
        ResultGet: {
          Resultado: "A",
          PtoVta: String(point),
          CbteTipo: String(type),
          CbteDesde: String(number),
          CbteHasta: String(number),
          CbteFch: valor(enviado, "CbteFch"),
          Concepto: "1",
          DocTipo: valor(enviado, "DocTipo"),
          DocNro: valor(enviado, "DocNro"),
          MonId: "PES",
          MonCotiz: "1",
          ImpTotal: total,
          ImpNeto: total,
          ImpIVA: "0",
          ImpTrib: "0",
          ImpOpEx: "0",
          ImpTotConc: "0",
          CodAutorizacion: "12345678901234",
          FchVto: "20991231",
        },
      };
    }
    throw new Error(`Operación inesperada ${operation}`);
  };
  return { estado, call };
}

const scope = (tx: Prisma.TransactionClient) =>
  new Proxy(tx, {
    get(target, key) {
      return key === "$transaction"
        ? (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)
        : Reflect.get(target, key);
    },
  }) as unknown as PrismaService;

describe("comprobantes que no llegaron a ARCA (base local con rollback, ARCA simulada)", () => {
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

  async function fixture(tx: Prisma.TransactionClient) {
    const profile = {
      legalName: "Fixture no emitido",
      cuit: "20247237837",
      vatCondition: "MONOTAX",
      address: "Test",
      city: "Test",
      province: "Test",
      activityStart: "2026-01-01",
      grossIncomeId: "20247237837",
    };
    const org = await tx.organization.create({
      data: { name: "Farmacia no emitido", fiscalProfile: profile },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Central", code: "N" },
    });
    const user = await tx.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: "not-a-secret",
      },
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: {
          in: ["SALE_MANAGE", "SALE_READ", "ORGANIZATION_MANAGE", "CASH_READ"],
        },
      },
    });
    const role = await tx.role.create({
      data: {
        organizationId: org.id,
        name: "Fixture",
        code: "N",
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
    return { profile, org, branch, user };
  }

  // Simula el paso del tiempo sin esperar de verdad.
  const envejecer = (
    tx: Prisma.TransactionClient,
    table: "FiscalDocument" | "FiscalTrial",
    id: string,
  ) =>
    table === "FiscalDocument"
      ? tx.$executeRaw`UPDATE "FiscalDocument" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${id}::uuid`
      : tx.$executeRaw`UPDATE "FiscalTrial" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${id}::uuid`;

  it("producción: libera el punto sólo si ARCA confirma que no llegó, y deja volver a emitir", async () => {
    const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    const rollback = new Error("ROLLBACK_NO_EMITIDO");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            const { profile, org, branch, user } = await fixture(tx);
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
                point: 99997,
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
                number: "N",
                quantity: 50,
                unitCostMinor: 4000n,
              },
            });
            const scoped = scope(tx);
            const organizations = new OrganizationsService(scoped);
            const vault = app.get(CredentialVault);
            jest.spyOn(vault, "provider").mockReturnValue("AES256_GCM");
            const connection = app.get(ArcaConnectionService);
            jest.spyOn(connection, "access").mockResolvedValue({
              environment: "PRODUCTION",
              token: "fixture",
              sign: "fixture",
              cuit: profile.cuit,
              version: 1,
            });
            jest.spyOn(connection, "points").mockResolvedValue([
              {
                number: 99997,
                type: "CAE - Monotributo",
                blocked: "N",
                closed: "",
              },
            ]);
            const config = new ProductionConfigurationService(
              scoped,
              organizations,
              connection,
              vault,
            );
            const soap = new ArcaSoap();
            const arca = arcaSimulada(profile.cuit, 99997);
            jest.spyOn(soap, "call").mockImplementation(arca.call);
            const production = new ProductionSalesService(
              scoped,
              config,
              connection,
              soap,
              organizations,
            );
            const sales = new SalesService(
              scoped,
              new AuditService(scoped),
              app.get(FiscalSalesService),
              production,
              config,
            );
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
                payments: [{ method: "CASH", amountMinor: 10000 }],
              });
            const factura = (saleId: string) =>
              tx.fiscalDocument.findFirstOrThrow({
                where: { sourceSaleId: saleId, kind: "INVOICE" },
              });

            // 1. El envío se corta antes de llegar: queda incierto y traba el punto.
            arca.estado.envio = "no-llega";
            const venta = await vender();
            const incierta = await factura(venta.id);
            expect(incierta.status).toBe("UNCERTAIN");
            expect(incierta.number).toBe(1);
            arca.estado.envio = "ok";
            const trabada = await vender();
            expect((await factura(trabada.id)).status).toBe("QUEUED");

            // 2. Antes de la espera, consultar no libera ni reinicia el reloj.
            const temprano = await production.process(
              user.id,
              org.id,
              branch.id,
              venta.id,
            );
            expect(temprano.status).toBe("UNCERTAIN");
            expect(temprano.detail).toContain("todavía no muestra");
            expect((await factura(venta.id)).updatedAt).toEqual(
              incierta.updatedAt,
            );

            // 3. Pasada la espera, ARCA confirma que no existe: se libera.
            await envejecer(tx, "FiscalDocument", incierta.id);
            const liberada = await production.process(
              user.id,
              org.id,
              branch.id,
              venta.id,
            );
            expect(liberada.status).toBe("REJECTED");
            expect(liberada.detail).toContain("No llegó a ARCA");

            // 4. El punto quedó libre: la venta trabada ahora se emite.
            const destrabada = await production.process(
              user.id,
              org.id,
              branch.id,
              trabada.id,
            );
            expect(destrabada.status).toBe("AUTHORIZED");
            expect(destrabada.number).toBe(1);

            // 5. Volver a emitir usa el mismo registro y un número nuevo.
            const reemitida = await sales.requeueInvoice(
              user.id,
              org.id,
              branch.id,
              venta.id,
            );
            expect(reemitida.status).toBe("AUTHORIZED");
            expect(reemitida.number).toBe(2);
            expect(reemitida.id).toBe(incierta.id);
            expect(
              await tx.fiscalDocument.count({
                where: { sourceSaleId: venta.id },
              }),
            ).toBe(1);
            expect(
              await tx.auditLog.count({
                where: { entityId: incierta.id, action: "REENCOLADO" },
              }),
            ).toBe(1);
            await expect(
              sales.requeueInvoice(user.id, org.id, branch.id, venta.id),
            ).rejects.toThrow("rechazada");

            // 6. Si ARCA sí lo registró, nunca se libera: se recupera el CAE.
            arca.estado.envio = "respuesta-perdida";
            const perdida = await vender();
            expect((await factura(perdida.id)).status).toBe("UNCERTAIN");
            arca.estado.envio = "ok";
            await envejecer(
              tx,
              "FiscalDocument",
              (await factura(perdida.id)).id,
            );
            const recuperada = await production.process(
              user.id,
              org.id,
              branch.id,
              perdida.id,
            );
            expect(recuperada.status).toBe("AUTHORIZED");

            // 7. Una respuesta sólo con errores tampoco libera de entrada.
            arca.estado.envio = "solo-errores";
            const conErrores = await vender();
            const errores = await factura(conErrores.id);
            expect(errores.status).toBe("UNCERTAIN");
            expect(errores.detail).toContain("ARCA respondió: 600");
            arca.estado.envio = "ok";
            await envejecer(tx, "FiscalDocument", errores.id);
            expect(
              (
                await production.process(
                  user.id,
                  org.id,
                  branch.id,
                  conErrores.id,
                )
              ).status,
            ).toBe("REJECTED");
            const emisiones = arca.estado.emisiones;
            expect(
              (
                await sales.requeueInvoice(
                  user.id,
                  org.id,
                  branch.id,
                  conErrores.id,
                )
              ).status,
            ).toBe("AUTHORIZED");
            expect(arca.estado.emisiones).toBe(emisiones + 1);
            throw rollback;
          },
          { timeout: 60000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      if (previous === undefined) delete process.env.FISCAL_PRODUCTION_ISSUANCE;
      else process.env.FISCAL_PRODUCTION_ISSUANCE = previous;
      jest.restoreAllMocks();
    }
  }, 70000);

  it("homologación: libera la prueba que no llegó y nunca la que ARCA registró", async () => {
    const rollback = new Error("ROLLBACK_NO_EMITIDO_HOMO");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            const { profile, org, branch, user } = await fixture(tx);
            const scoped = scope(tx);
            const connection = app.get(ArcaConnectionService);
            jest.spyOn(connection, "access").mockResolvedValue({
              token: "fixture",
              sign: "fixture",
              cuit: profile.cuit,
              version: 1,
            });
            const soap = new ArcaSoap();
            const arca = arcaSimulada(profile.cuit, 1);
            jest.spyOn(soap, "call").mockImplementation(arca.call);
            const trials = new FiscalTrialService(
              scoped,
              new OrganizationsService(scoped),
              connection,
              soap,
            );
            const prueba = (number: number, sourceSaleId?: string) =>
              tx.fiscalTrial.create({
                data: {
                  organizationId: org.id,
                  requestId: sourceSaleId ?? randomUUID(),
                  sourceSaleId,
                  status: "UNCERTAIN",
                  point: 1,
                  voucherType: 11,
                  number,
                  date: "20261107",
                  totalMinor: 10000,
                  issuer: { ...profile },
                },
              });

            // No llegó: se libera después de la espera.
            const sinLlegar = await prueba(1);
            expect(
              (await trials.reconcile(user.id, org.id, sinLlegar.id)).status,
            ).toBe("UNCERTAIN");
            await envejecer(tx, "FiscalTrial", sinLlegar.id);
            const liberada = await trials.reconcile(
              user.id,
              org.id,
              sinLlegar.id,
            );
            expect(liberada.status).toBe("REJECTED");
            expect(liberada.detail).toContain("otra prueba");

            // ARCA la tiene pero no coincide: sigue incierta, nunca se libera.
            await arca.call(
              "wsfe",
              "FECAESolicitar",
              "<CbteTipo>11</CbteTipo><CbteDesde>2</CbteDesde><CbteFch>20261106</CbteFch><ImpTotal>100.00</ImpTotal><DocTipo>99</DocTipo><DocNro>0</DocNro>",
            );
            const distinta = await prueba(2);
            await envejecer(tx, "FiscalTrial", distinta.id);
            expect(
              (await trials.reconcile(user.id, org.id, distinta.id)).status,
            ).toBe("UNCERTAIN");

            // La factura de prueba de una venta se puede volver a poner en cola.
            const sale = await tx.sale.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                status: "COMPLETED",
                documentType: "INVOICE",
                totalMinor: 10000n,
                completedAt: new Date(),
              },
            });
            const deVenta = await tx.fiscalTrial.update({
              where: { id: (await prueba(9, sale.id)).id },
              data: { status: "REJECTED" },
            });
            await trials.requeue(user.id, org.id, branch.id, sale.id);
            const enCola = await tx.fiscalTrial.findUniqueOrThrow({
              where: { id: deVenta.id },
            });
            expect(enCola.status).toBe("QUEUED");
            expect(enCola.number).toBeNull();
            await expect(
              trials.requeue(user.id, org.id, branch.id, sale.id),
            ).rejects.toThrow("rechazada");
            throw rollback;
          },
          { timeout: 60000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      jest.restoreAllMocks();
    }
  }, 70000);
});
