import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CashService } from "../src/cash/cash.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { SalesService } from "../src/sales/sales.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import { ProductionCreditService } from "../src/fiscal/production-credit.service";
import { ProductionConfigurationService } from "../src/fiscal/production-configuration.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { CredentialVault } from "../src/fiscal/credential-vault";

describe("production workflow with local rollback DB and mocked ARCA", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Local development DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });
  it("persists production separately, issues once, credits partial quantities, settles once and recovers uncertain results", async () => {
    const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    const rollback = new Error("ROLLBACK_PRODUCTION_FIXTURE");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            const profile = {
              legalName: "Production fixture",
              cuit: "20247237837",
              vatCondition: "MONOTAX",
              address: "Test",
              city: "Test",
              province: "Test",
              activityStart: "2026-01-01",
              grossIncomeId: "20247237837",
            };
            const org = await tx.organization.create({
              data: { name: "Farmacia fixture", fiscalProfile: profile },
            });
            const branch = await tx.branch.create({
              data: { organizationId: org.id, name: "Central", code: "P" },
            });
            const user = await tx.user.create({
              data: {
                email: randomUUID() + "@example.invalid",
                passwordHash: "not-a-secret",
              },
            });
            const permissions = await tx.permission.findMany({
              where: {
                code: {
                  in: [
                    "SALE_MANAGE",
                    "SALE_READ",
                    "ORGANIZATION_MANAGE",
                    "CASH_READ",
                    "CASH_MANAGE",
                  ],
                },
              },
            });
            const role = await tx.role.create({
              data: {
                organizationId: org.id,
                name: "Fixture",
                code: "P",
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
                point: 99998,
                issuerCuit: profile.cuit,
                credentialVersion: 1,
                enabled: true,
                exclusiveConfirmed: true,
                activatedAt: new Date(),
              },
            });
            const product = await tx.product.create({
              data: { organizationId: org.id, name: "Producto original" },
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
            const lot = await tx.productLot.create({
              data: {
                organizationId: org.id,
                branchId: branch.id,
                productId: product.id,
                number: "P",
                quantity: 30,
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
              },
            });
            const scoped = new Proxy(tx, {
              get(target, key) {
                return key === "$transaction"
                  ? (
                      fn: (
                        client: Prisma.TransactionClient,
                      ) => Promise<unknown>,
                    ) => fn(tx)
                  : Reflect.get(target, key);
              },
            }) as unknown as PrismaService;
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
                number: 99998,
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
            let sends = 0;
            let timeout = false;
            const last = new Map<number, number>();
            const external = jest
              .spyOn(soap, "call")
              .mockImplementation(
                async (_kind, operation, body, environment) => {
                  expect(environment).toBe("PRODUCTION");
                  const value = (tag: string) =>
                    new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(body)?.[1] ??
                    "";
                  const type = Number(value("CbteTipo"));
                  if (operation === "FECompUltimoAutorizado")
                    return {
                      CbteNro: String(last.get(type) ?? 0),
                      PtoVta: "99998",
                      CbteTipo: String(type),
                    };
                  if (operation === "FECAESolicitar") {
                    sends++;
                    last.set(type, Number(value("CbteDesde")));
                    if (timeout)
                      throw new Error(
                        "Lost response after simulated authorization",
                      );
                    return {
                      FeCabResp: {
                        Cuit: profile.cuit,
                        PtoVta: "99998",
                        CbteTipo: String(type),
                        CantReg: "1",
                        Resultado: "A",
                      },
                      FeDetResp: {
                        FECAEDetResponse: {
                          Resultado: "A",
                          CbteDesde: value("CbteDesde"),
                          CbteHasta: value("CbteHasta"),
                          CbteFch: value("CbteFch"),
                          DocTipo: value("DocTipo"),
                          DocNro: value("DocNro"),
                          CAE: "12345678901234",
                          CAEFchVto: "20990101",
                        },
                      },
                    };
                  }
                  if (operation === "FECompConsultar") {
                    const doc = await tx.fiscalDocument.findFirstOrThrow({
                      where: {
                        organizationId: org.id,
                        voucherType: type,
                        number: Number(value("CbteNro")),
                      },
                    });
                    return {
                      ResultGet: {
                        Resultado: "A",
                        PtoVta: String(doc.point),
                        CbteTipo: String(type),
                        CbteDesde: String(doc.number),
                        CbteHasta: String(doc.number),
                        CbteFch: doc.date,
                        Concepto: "1",
                        DocTipo: String(doc.docType),
                        DocNro: doc.docNumber,
                        MonId: "PES",
                        MonCotiz: "1",
                        ImpTotal: (doc.totalMinor / 100).toFixed(2),
                        ImpNeto: (doc.totalMinor / 100).toFixed(2),
                        ImpIVA: "0",
                        ImpTrib: "0",
                        ImpOpEx: "0",
                        ImpTotConc: "0",
                        CodAutorizacion: "12345678901234",
                        FchVto: "20990101",
                      },
                    };
                  }
                  throw new Error("Unexpected external operation");
                },
              );
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
            const credits = new ProductionCreditService(
              scoped,
              production,
              config,
              organizations,
              new AccountsService(scoped, new AuditService(scoped)),
            );
            const input = {
              documentType: "INVOICE" as const,
              fiscalEnvironment: "PRODUCTION" as const,
              confirmProduction: true,
              clientOperationId: randomUUID(),
              fiscalOptions: {
                recipient: "FINAL_CONSUMER" as const,
                voucherType: 11 as const,
              },
              items: [
                { productId: product.id, quantity: 2, discountMinor: 1000 },
              ],
              payments: [
                {
                  method: "CASH" as const,
                  amountMinor: 20000,
                  cashSessionId: session.id,
                },
              ],
            };
            await expect(
              sales.complete(user.id, org.id, branch.id, {
                ...input,
                confirmProduction: false,
              }),
            ).rejects.toThrow();
            expect(
              await tx.sale.count({ where: { organizationId: org.id } }),
            ).toBe(0);
            const first = await sales.complete(
              user.id,
              org.id,
              branch.id,
              input,
            );
            const doc = await tx.fiscalDocument.findFirstOrThrow({
              where: { sourceSaleId: first.id },
            });
            expect(doc.status).toBe("AUTHORIZED");
            expect(doc.environment).toBe("PRODUCTION");
            expect(
              await tx.fiscalTrial.count({ where: { organizationId: org.id } }),
            ).toBe(0);
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(28);
            expect(
              (await sales.complete(user.id, org.id, branch.id, input)).id,
            ).toBe(first.id);
            expect(sends).toBe(1);
            await expect(
              sales.complete(user.id, org.id, branch.id, {
                ...input,
                clientOperationId: randomUUID(),
                fiscalEnvironment: "HOMOLOGATION",
                confirmProduction: false,
                confirmHomologation: true,
              }),
            ).rejects.toThrow("producción");
            await expect(
              sales.cancel(user.id, org.id, branch.id, first.id, "test"),
            ).rejects.toThrow("nota de crédito");
            const print = await sales.invoice(
              user.id,
              org.id,
              branch.id,
              first.id,
            );
            expect(print.ticket.store.name).toBe("Farmacia fixture");
            expect(print.ticket.changeMinor).toBe("1000");
            expect(production.present(doc).qrUrl).toContain(
              "https://www.arca.gob.ar/fe/qr/",
            );
            const item = await tx.saleItem.findFirstOrThrow({
              where: { saleId: first.id },
            });
            const request = {
              requestId: randomUUID(),
              reason: "Devolución parcial",
              confirmProduction: true,
              items: [{ saleItemId: item.id, quantity: 1 }],
            };
            const note = await credits.create(
              user.id,
              org.id,
              branch.id,
              first.id,
              request,
            );
            expect(note.status).toBe("AUTHORIZED");
            expect(note.voucherType).toBe(13);
            expect(note.totalMinor).toBe(9500);
            expect(
              external.mock.calls
                .filter((call) => call[1] === "FECAESolicitar")
                .at(-1)?.[2],
            ).toContain("<CbtesAsoc>");
            expect(
              (
                await credits.create(
                  user.id,
                  org.id,
                  branch.id,
                  first.id,
                  request,
                )
              ).id,
            ).toBe(note.id);
            expect(sends).toBe(2);
            const settle = {
              expectedAccountMinor: 0,
              expectedRefundMinor: 9500,
              method: "CASH" as const,
              cashSessionId: session.id,
              reference: "Efectivo entregado fixture",
              received: true,
              confirm: true,
            };
            await credits.settle(
              user.id,
              org.id,
              branch.id,
              first.id,
              note.id,
              settle,
            );
            await credits.settle(
              user.id,
              org.id,
              branch.id,
              first.id,
              note.id,
              settle,
            );
            expect(
              await tx.cashMovement.count({
                where: {
                  cashSessionId: session.id,
                  reason: { contains: note.id },
                },
              }),
            ).toBe(1);
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(28);
            expect(
              await tx.customerReturn.count({ where: { saleId: first.id } }),
            ).toBe(1);
            const second = await credits.create(
              user.id,
              org.id,
              branch.id,
              first.id,
              { ...request, requestId: randomUUID() },
            );
            expect(second.totalMinor).toBe(9500);
            expect(
              (await credits.detail(user.id, org.id, branch.id, first.id))
                .items[0]?.available,
            ).toBe(0);
            await expect(
              credits.create(user.id, org.id, branch.id, first.id, {
                ...request,
                requestId: randomUUID(),
              }),
            ).rejects.toThrow("cantidad");
            const customer = await tx.customer.create({
              data: {
                organizationId: org.id,
                name: "Cliente financiado",
                creditEnabled: true,
                creditLimitMinor: null,
              },
            });
            const financed = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
              customerId: customer.id,
              payments: [{ method: "ACCOUNT", amountMinor: 19000 }],
            });
            const financedItem = await tx.saleItem.findFirstOrThrow({
              where: { saleId: financed.id },
            });
            const financedCredit = await credits.create(
              user.id,
              org.id,
              branch.id,
              financed.id,
              {
                ...request,
                requestId: randomUUID(),
                items: [{ saleItemId: financedItem.id, quantity: 1 }],
              },
            );
            expect(
              await credits.previewSettlement(
                user.id,
                org.id,
                branch.id,
                financed.id,
                financedCredit.id,
              ),
            ).toMatchObject({ accountMinor: 9500, refundMinor: 0 });
            await credits.settle(
              user.id,
              org.id,
              branch.id,
              financed.id,
              financedCredit.id,
              { ...settle, expectedAccountMinor: 9500, expectedRefundMinor: 0 },
            );
            const balances = await new AccountsService(
              scoped,
              new AuditService(scoped),
            ).itemBalances(tx, user.id, org.id, customer.id);
            expect(balances.balanceMinor).toBe("9500");
            expect(
              balances.items.find((i) => i.saleItemId === financedItem.id)
                ?.pendingMinor,
            ).toBe("9500");
            expect(
              await tx.cashMovement.count({
                where: { reason: { contains: financedCredit.id } },
              }),
            ).toBe(0);
            // A fiscal refund and the original pending receipt are separate
            // operations: later incorporation must preserve both, not net twice.
            const cash = new CashService(scoped, new AuditService(scoped));
            const pendingSale = await sales.complete(
              user.id,
              org.id,
              branch.id,
              {
                ...input,
                clientOperationId: randomUUID(),
                payments: [
                  { method: "CASH", amountMinor: 10000 },
                  { method: "TRANSFER", amountMinor: 9000 },
                ],
              },
            );
            const pendingItem = await tx.saleItem.findFirstOrThrow({
              where: { saleId: pendingSale.id },
            });
            const pendingCollection =
              await tx.cashPendingCollection.findFirstOrThrow({
                where: { sourceId: pendingSale.id, sourceType: "SALE" },
              });
            expect(pendingCollection.cashMinor).toBe(10000n);
            const pendingNote = await credits.create(
              user.id,
              org.id,
              branch.id,
              pendingSale.id,
              {
                ...request,
                requestId: randomUUID(),
                items: [{ saleItemId: pendingItem.id, quantity: 1 }],
              },
            );
            expect(pendingNote.totalMinor).toBe(9500);
            const beforePendingRefund = (
              await cash.list(user.id, org.id, branch.id)
            ).sessions.find((row) => row.id === session.id)!;
            await expect(
              credits.settle(
                user.id,
                org.id,
                branch.id,
                pendingSale.id,
                pendingNote.id,
                {
                  ...settle,
                  cashSessionId: undefined,
                },
              ),
            ).rejects.toThrow("caja abierta");
            await credits.settle(
              user.id,
              org.id,
              branch.id,
              pendingSale.id,
              pendingNote.id,
              settle,
            );
            await credits.settle(
              user.id,
              org.id,
              branch.id,
              pendingSale.id,
              pendingNote.id,
              settle,
            );
            expect(
              (
                await tx.cashPendingCollection.findUniqueOrThrow({
                  where: { id: pendingCollection.id },
                })
              ).assignedAt,
            ).toBeNull();
            await cash.assignCollection(
              user.id,
              org.id,
              branch.id,
              pendingCollection.id,
              session.id,
            );
            await cash.assignCollection(
              user.id,
              org.id,
              branch.id,
              pendingCollection.id,
              session.id,
            );
            const afterPendingRefund = (
              await cash.list(user.id, org.id, branch.id)
            ).sessions.find((row) => row.id === session.id)!;
            expect(
              BigInt(afterPendingRefund.expectedAmountMinor) -
                BigInt(beforePendingRefund.expectedAmountMinor),
            ).toBe(500n);
            expect(
              await tx.cashMovement.count({
                where: {
                  cashSessionId: session.id,
                  reason: { contains: pendingNote.id },
                },
              }),
            ).toBe(1);
            expect(
              await tx.cashMovement.count({
                where: {
                  cashSessionId: session.id,
                  reason: { contains: pendingSale.id },
                  type: "IN",
                },
              }),
            ).toBe(1);
            expect(
              await tx.salePayment.count({
                where: { saleId: pendingSale.id, cashSessionId: { not: null } },
              }),
            ).toBe(0);
            timeout = true;
            const uncertain = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
            });
            expect(
              (
                await tx.fiscalDocument.findFirstOrThrow({
                  where: { sourceSaleId: uncertain.id },
                })
              ).status,
            ).toBe("UNCERTAIN");
            const before = sends;
            const queued = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
            });
            expect(
              (
                await tx.fiscalDocument.findFirstOrThrow({
                  where: { sourceSaleId: queued.id },
                })
              ).status,
            ).toBe("QUEUED");
            expect(sends).toBe(before);
            const recovered = await production.process(
              user.id,
              org.id,
              branch.id,
              uncertain.id,
            );
            expect(recovered.status).toBe("AUTHORIZED");
            expect(sends).toBe(before);
            delete process.env.FISCAL_PRODUCTION_ISSUANCE;
            await expect(
              sales.complete(user.id, org.id, branch.id, {
                ...input,
                clientOperationId: randomUUID(),
              }),
            ).rejects.toThrow();
            expect(
              (
                await production.process(
                  user.id,
                  org.id,
                  branch.id,
                  uncertain.id,
                )
              ).status,
            ).toBe("AUTHORIZED");
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
});
