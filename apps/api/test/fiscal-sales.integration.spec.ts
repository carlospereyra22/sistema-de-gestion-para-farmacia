import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { AuditService } from "../src/audit/audit.service";
import { SalesService } from "../src/sales/sales.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";

describe("Sales with homologation (rollback fixtures, no real ARCA calls)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    if (
      !["localhost", "127.0.0.1", "::1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Local DB only");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
  });
  it("deducts stock and cash once, snapshots items, recovers timeouts without issuing again", async () => {
    const rollback = new Error("ROLLBACK_FISCAL_SALES");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const profile = {
            legalName: "Fixture",
            cuit: "20247237837",
            vatCondition: "MONOTAX",
            address: "Test",
            city: "Test",
            province: "Test",
            activityStart: "2026-01-01",
          };
          const org = await tx.organization.create({
            data: { name: "Fiscal sales fixture", fiscalProfile: profile },
          });
          const branch = await tx.branch.create({
            data: { organizationId: org.id, name: "Test", code: "TEST" },
          });
          const user = await tx.user.create({
            data: {
              email: randomUUID() + "@example.invalid",
              passwordHash: "test",
            },
          });
          const permissions = await tx.permission.findMany({
            where: { code: { in: ["SALE_MANAGE", "SALE_READ"] } },
          });
          const role = await tx.role.create({
            data: {
              organizationId: org.id,
              name: "Cashier",
              code: "TEST",
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
          const product = await tx.product.create({
            data: { organizationId: org.id, name: "Original product" },
          });
          const list = await tx.priceList.create({
            data: { organizationId: org.id, name: "Precio general" },
          });
          await tx.productPrice.create({
            data: {
              productId: product.id,
              priceListId: list.id,
              amountMinor: 10000n,
            },
          });
          const lot = await tx.productLot.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              productId: product.id,
              number: "TEST",
              quantity: 10,
              unitCostMinor: 5000n,
            },
          });
          const register = await tx.cashRegister.create({
            data: { branchId: branch.id, name: "Test" },
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
                    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
                  ) => fn(tx)
                : Reflect.get(target, key);
            },
          }) as unknown as PrismaService;
          const connection = app.get(ArcaConnectionService);
          const access = jest.spyOn(connection, "access").mockResolvedValue({
            token: "mock",
            sign: "mock",
            cuit: profile.cuit,
            version: 1,
          });
          const points = jest
            .spyOn(connection, "points")
            .mockResolvedValue([
              { number: 1, blocked: "N", type: "CAE", closed: "" },
            ]);
          const soap = new ArcaSoap();
          let sends = 0;
          let timeout = false;
          const external = jest
            .spyOn(soap, "call")
            .mockImplementation(async (_kind, op, body) => {
              if (op === "FECompUltimoAutorizado")
                return { CbteNro: String(sends) };
              if (op === "FECAESolicitar") {
                sends++;
                expect(body).toContain("<ImpTotal>190.00</ImpTotal>");
                expect(body).toContain("<ImpNeto>190.00</ImpNeto>");
                if (timeout) throw new Error("Mock timeout");
                return {
                  FeCabResp: { PtoVta: "1", CbteTipo: "11", Resultado: "A" },
                  FeDetResp: {
                    FECAEDetResponse: {
                      Resultado: "A",
                      CbteDesde: String(sends),
                      CbteHasta: String(sends),
                      CAE: "12345678901234",
                      CAEFchVto: "20261007",
                    },
                  },
                };
              }
              throw new Error("Unexpected SOAP operation");
            });
          const trials = new FiscalTrialService(
            scoped,
            new OrganizationsService(scoped),
            connection,
            soap,
          );
          const fiscal = new FiscalSalesService(scoped, connection, trials);
          const sales = new SalesService(
            scoped,
            new AuditService(scoped),
            fiscal,
          );
          const input = {
            documentType: "INVOICE" as const,
            confirmHomologation: true,
            clientOperationId: randomUUID(),
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
          try {
            await expect(
              sales.complete(user.id, org.id, branch.id, {
                ...input,
                confirmHomologation: false,
              }),
            ).rejects.toThrow();
            expect(
              await tx.sale.count({ where: { organizationId: org.id } }),
            ).toBe(0);
            const first = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              fiscalOptions: {
                recipient: "FINAL_CONSUMER",
                voucherType: 11,
                consumerName: "Receptor original",
                consumerDocument: "12345678",
              },
            });
            expect(first.documentType).toBe("INVOICE");
            expect(first.fiscalTrial?.status).toBe("AUTHORIZED");
            expect(first.fiscalTrial?.saleSnapshot).toMatchObject({
              recipient: {
                name: "Receptor original",
                vatId: 5,
                docType: 96,
                docNumber: "12345678",
              },
            });
            expect(
              external.mock.calls.find(
                (call) => call[1] === "FECAESolicitar",
              )?.[2],
            ).toContain("<DocTipo>96</DocTipo><DocNro>12345678</DocNro>");
            expect(
              await sales.fiscalOptions(user.id, org.id, branch.id),
            ).toMatchObject({
              environment: "HOMOLOGATION",
              voucherTypes: [{ code: 11, label: "Factura C" }],
            });
            expect(first.totalMinor).toBe("19000");
            expect(access).toHaveBeenCalledWith(user.id, org.id, "sale");
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(8);
            const cashCount = await tx.cashMovement.count({
              where: { cashSessionId: session.id },
            });
            expect(cashCount).toBeGreaterThan(0);
            expect(
              (await sales.complete(user.id, org.id, branch.id, input)).id,
            ).toBe(first.id);
            expect(sends).toBe(1);
            expect(
              (await sales.invoice(user.id, org.id, branch.id, first.id))
                .saleSnapshot,
            ).toMatchObject({
              recipient: { name: "Receptor original", docNumber: "12345678" },
            });
            expect(
              await tx.cashMovement.count({
                where: { cashSessionId: session.id },
              }),
            ).toBe(cashCount);
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(8);
            await expect(
              sales.cancel(user.id, org.id, branch.id, first.id, "test"),
            ).rejects.toThrow("nota de crédito");
            await expect(
              sales.ticket(user.id, org.id, branch.id, first.id),
            ).rejects.toThrow("ticket interno");
            await expect(
              sales.invoice(user.id, org.id, randomUUID(), first.id),
            ).rejects.toThrow();
            await tx.product.update({
              where: { id: product.id },
              data: { name: "Renamed" },
            });
            expect(
              JSON.stringify(
                (await sales.invoice(user.id, org.id, branch.id, first.id))
                  .saleSnapshot,
              ),
            ).toContain("Original product");
            await tx.organization.update({
              where: { id: org.id },
              data: { name: "Changed commercial name" },
            });
            const printed = await sales.invoice(
              user.id,
              org.id,
              branch.id,
              first.id,
            );
            expect(printed.ticket.store.name).toBe("Fiscal sales fixture");
            expect(printed.ticket.items[0]?.name).toBe("Original product");
            expect(printed.ticket.changeMinor).toBe("1000");
            expect(printed.ticket.totalMinor).toBe("19000");
            timeout = true;
            const uncertain = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
            });
            expect(uncertain.fiscalTrial?.status).toBe("UNCERTAIN");
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(6);
            external.mockImplementation(async (_kind, op) => {
              if (op !== "FECompConsultar") throw new Error("Must not reissue");
              return {
                ResultGet: {
                  Resultado: "A",
                  CbteDesde: "2",
                  CbteHasta: "2",
                  PtoVta: "1",
                  CbteTipo: "11",
                  CbteFch: uncertain.fiscalTrial!.date,
                  ImpTotal: "190.00",
                  DocTipo: "99",
                  DocNro: "0",
                  Concepto: "1",
                  MonId: "PES",
                  CodAutorizacion: "12345678901235",
                  FchVto: "20261007",
                },
              };
            });
            expect(
              (
                await sales.invoice(
                  user.id,
                  org.id,
                  branch.id,
                  uncertain.id,
                  true,
                )
              ).status,
            ).toBe("AUTHORIZED");
            expect(sends).toBe(2);
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(6);
            // Offline before dispatch: persist a queue entry; cancellation safely restores local stock.
            access.mockRejectedValue(new Error("Offline"));
            const queued = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
            });
            expect(queued.fiscalTrial?.status).toBe("QUEUED");
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(4);
            await sales.cancel(
              user.id,
              org.id,
              branch.id,
              queued.id,
              "Cancelled offline test",
            );
            await expect(
              sales.invoice(user.id, org.id, branch.id, queued.id, true),
            ).rejects.toThrow("anulada");
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(6);
            const retry = await sales.complete(user.id, org.id, branch.id, {
              ...input,
              clientOperationId: randomUUID(),
            });
            expect(retry.fiscalTrial?.status).toBe("QUEUED");
            access.mockResolvedValue({
              token: "mock",
              sign: "mock",
              cuit: profile.cuit,
              version: 1,
            });
            external.mockImplementation(async (_kind, op) => {
              if (op === "FECompUltimoAutorizado") return { CbteNro: "2" };
              if (op === "FECAESolicitar") {
                sends++;
                return {
                  FeCabResp: { PtoVta: "1", CbteTipo: "11", Resultado: "A" },
                  FeDetResp: {
                    FECAEDetResponse: {
                      Resultado: "A",
                      CbteDesde: "3",
                      CbteHasta: "3",
                      CAE: "12345678901236",
                      CAEFchVto: "20261007",
                    },
                  },
                };
              }
              throw new Error("Unexpected SOAP operation");
            });
            expect(
              (await sales.invoice(user.id, org.id, branch.id, retry.id, true))
                .status,
            ).toBe("AUTHORIZED");
            expect(
              (await sales.invoice(user.id, org.id, branch.id, retry.id, true))
                .status,
            ).toBe("AUTHORIZED");
            expect(sends).toBe(3);
            expect(
              (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
                .quantity,
            ).toBe(4);
            const manualSale = await sales.complete(
              user.id,
              org.id,
              branch.id,
              {
                documentType: "INVOICE",
                confirmHomologation: true,
                clientOperationId: randomUUID(),
                items: [
                  {
                    description: "Concepto fiscal puntual",
                    quantity: 1,
                    unitPriceMinor: 1200,
                  },
                ],
                payments: [{ method: "TRANSFER", amountMinor: 1200 }],
              },
            );
            const manualTrial = await tx.fiscalTrial.findFirstOrThrow({
              where: { sourceSaleId: manualSale.id },
            });
            expect(JSON.stringify(manualTrial.saleSnapshot)).toContain(
              "Concepto fiscal puntual",
            );
            expect(
              await tx.inventoryMovement.count({
                where: { referenceId: manualSale.id },
              }),
            ).toBe(0);
            const specialPriceSale = await sales.complete(
              user.id,
              org.id,
              branch.id,
              {
                documentType: "INVOICE",
                confirmHomologation: true,
                clientOperationId: randomUUID(),
                items: [
                  {
                    productId: product.id,
                    quantity: 1,
                    expectedUnitPriceMinor: "10000",
                    requestedUnitPriceMinor: 9000,
                  },
                ],
                payments: [{ method: "TRANSFER", amountMinor: 9000 }],
              },
            );
            const specialTrial = await tx.fiscalTrial.findFirstOrThrow({
              where: { sourceSaleId: specialPriceSale.id },
            });
            expect(specialTrial.totalMinor).toBe(9000);
            expect(specialTrial.saleSnapshot).toMatchObject({
              items: [
                expect.objectContaining({
                  unitPriceMinor: "9000",
                  amountMinor: "9000",
                }),
              ],
            });
          } finally {
            access.mockRestore();
            points.mockRestore();
          }
          throw rollback;
        },
        { timeout: 25000 },
      ),
    ).rejects.toBe(rollback);
  });
});
