import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { AuditService } from "../src/audit/audit.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { SalesService } from "../src/sales/sales.service";
import { NotasCreditoService } from "../src/sales/notas-credito.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { FiscalTrialService } from "../src/fiscal/fiscal-trial.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import { ProductionCreditService } from "../src/fiscal/production-credit.service";

// Notas de crédito (SISTEMA-110): interna y de prueba (homologación). La real
// está en production-sales.integration.spec.ts. Todo dentro de una transacción
// que se deshace; ARCA se simula.
describe("Notas de crédito interna y de prueba", () => {
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

  it("devuelve plata y stock en un paso y emite la nota C de prueba con la factura asociada", async () => {
    const rollback = new Error("ROLLBACK_NOTAS_CREDITO");
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
            data: { name: "Notas fixture", fiscalProfile: profile },
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
              name: "Cajero",
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
            data: { organizationId: org.id, name: "Ibuprofeno" },
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
              number: "L1",
              quantity: 10,
              unitCostMinor: 5000n,
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
              // Transacción como función o como lista de consultas.
              return key === "$transaction"
                ? (
                    fn:
                      | ((client: Prisma.TransactionClient) => Promise<unknown>)
                      | Promise<unknown>[],
                  ) => (Array.isArray(fn) ? Promise.all(fn) : fn(tx))
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
          const ultimos: Record<string, number> = {};
          const cuerpos: string[] = [];
          let rechazar = false;
          const external = jest
            .spyOn(soap, "call")
            .mockImplementation(async (_kind, op, body) => {
              const tipo = /<CbteTipo>(\d+)<\/CbteTipo>/.exec(body)?.[1] ?? "";
              if (op === "FECompUltimoAutorizado")
                return { CbteNro: String(ultimos[tipo] ?? 0) };
              if (op === "FECAESolicitar") {
                cuerpos.push(body);
                if (rechazar)
                  return {
                    FeCabResp: { PtoVta: "1", CbteTipo: tipo, Resultado: "R" },
                    FeDetResp: { FECAEDetResponse: { Resultado: "R" } },
                  };
                ultimos[tipo] = (ultimos[tipo] ?? 0) + 1;
                return {
                  FeCabResp: { PtoVta: "1", CbteTipo: tipo, Resultado: "A" },
                  FeDetResp: {
                    FECAEDetResponse: {
                      Resultado: "A",
                      CbteDesde: String(ultimos[tipo]),
                      CbteHasta: String(ultimos[tipo]),
                      CAE: "12345678901234",
                      CAEFchVto: "20991231",
                    },
                  },
                };
              }
              throw new Error("Operación SOAP inesperada");
            });
          const trials = new FiscalTrialService(
            scoped,
            new OrganizationsService(scoped),
            connection,
            soap,
          );
          const fiscal = new FiscalSalesService(scoped, connection, trials);
          const accounts = new AccountsService(
            scoped,
            new AuditService(scoped),
          );
          const sales = new SalesService(
            scoped,
            new AuditService(scoped),
            fiscal,
            undefined,
            undefined,
            accounts,
          );
          const notas = new NotasCreditoService(
            scoped,
            new AuditService(scoped),
            sales,
            accounts,
            fiscal,
            app.get(ProductionSalesService),
            app.get(ProductionCreditService),
          );
          const vender = (documentType: "INTERNAL" | "INVOICE") =>
            sales.complete(user.id, org.id, branch.id, {
              documentType,
              ...(documentType === "INVOICE"
                ? { confirmHomologation: true }
                : {}),
              clientOperationId: randomUUID(),
              items: [
                { productId: product.id, quantity: 2, discountMinor: 1000 },
              ],
              payments: [
                {
                  method: "CASH" as const,
                  amountMinor: 19000,
                  cashSessionId: session.id,
                },
              ],
            });
          const stock = async () =>
            (await tx.productLot.findUniqueOrThrow({ where: { id: lot.id } }))
              .quantity;
          const salidas = async (id: string) =>
            tx.cashMovement.findMany({
              where: { cashSessionId: session.id, reason: { contains: id } },
            });
          try {
            // Comprobante interno: nota interna, sin ARCA.
            const interna = await vender("INTERNAL");
            const renglon = await tx.saleItem.findFirstOrThrow({
              where: { saleId: interna.id },
            });
            expect(await stock()).toBe(8);
            const detalle = await notas.detalle(
              user.id,
              org.id,
              branch.id,
              interna.id,
            );
            expect(detalle).toMatchObject({
              tipo: "INTERNA",
              metodoSugerido: "CASH",
            });
            expect(detalle.items[0]).toMatchObject({
              available: 2,
              puedeReponer: true,
            });
            const pedido = {
              requestId: randomUUID(),
              reason: "Vino vencido",
              refundMethod: "CASH" as const,
              cashSessionId: session.id,
              items: [{ saleItemId: renglon.id, quantity: 1, reponer: true }],
            };
            await expect(
              notas.crear(user.id, org.id, branch.id, interna.id, {
                ...pedido,
                requestId: randomUUID(),
                refundMethod: undefined,
              }),
            ).rejects.toThrow("Elegí cómo");
            const hecha = await notas.crear(
              user.id,
              org.id,
              branch.id,
              interna.id,
              pedido,
            );
            expect(hecha.notas[0]).toMatchObject({
              creditKind: "INTERNA",
              totalMinor: "9500",
              refundMinor: "9500",
              accountMinor: "0",
              refundMethod: "CASH",
              fiscal: null,
            });
            expect(hecha.notas[0]?.items[0]).toMatchObject({
              quantity: 1,
              restocked: true,
            });
            expect(hecha.items[0]?.available).toBe(1);
            expect(await stock()).toBe(9);
            const [salida] = await salidas(hecha.notaId);
            expect(salida).toMatchObject({ type: "OUT", amountMinor: 9500n });
            // Mismo pedido: no repite la devolución.
            expect(
              (
                await notas.crear(
                  user.id,
                  org.id,
                  branch.id,
                  interna.id,
                  pedido,
                )
              ).notaId,
            ).toBe(hecha.notaId);
            expect(await salidas(hecha.notaId)).toHaveLength(1);
            expect(await stock()).toBe(9);
            expect(
              await tx.inventoryMovement.count({
                where: { referenceId: hecha.notaId, type: "CUSTOMER_RETURN" },
              }),
            ).toBe(1);
            await expect(
              sales.cancel(user.id, org.id, branch.id, interna.id, "test"),
            ).rejects.toThrow("devoluciones");

            // Factura de prueba: nota C (13) de prueba con la factura asociada.
            const facturada = await vender("INVOICE");
            const factura = await tx.fiscalTrial.findFirstOrThrow({
              where: { sourceSaleId: facturada.id },
            });
            expect(factura.status).toBe("AUTHORIZED");
            const renglonFactura = await tx.saleItem.findFirstOrThrow({
              where: { saleId: facturada.id },
            });
            expect(
              (await notas.detalle(user.id, org.id, branch.id, facturada.id))
                .tipo,
            ).toBe("FACTURA_PRUEBA");
            // ARCA la rechaza: la devolución queda hecha y la nota se reenvía.
            rechazar = true;
            const total = await notas.crear(
              user.id,
              org.id,
              branch.id,
              facturada.id,
              {
                requestId: randomUUID(),
                reason: "Se equivocó de producto",
                refundMethod: "TRANSFER",
                items: [
                  {
                    saleItemId: renglonFactura.id,
                    quantity: 2,
                    reponer: false,
                  },
                ],
              },
            );
            expect(total.notas[0]).toMatchObject({
              creditKind: "FACTURA",
              totalMinor: "19000",
              refundMethod: "TRANSFER",
            });
            expect(total.notas[0]?.fiscal).toMatchObject({
              environment: "HOMOLOGATION",
              kind: "CREDIT_NOTE",
              voucherType: 13,
              status: "REJECTED",
            });
            expect(await salidas(total.notaId)).toHaveLength(0);
            expect(await stock()).toBe(7);
            rechazar = false;
            const reenviada = await notas.reencolar(
              user.id,
              org.id,
              branch.id,
              facturada.id,
              total.notaId,
            );
            expect(reenviada).toMatchObject({
              status: "AUTHORIZED",
              number: 1,
              totalMinor: 19000,
            });
            const cuerpoNota = cuerpos.at(-1)!;
            expect(cuerpoNota).toContain("<CbteTipo>13</CbteTipo>");
            expect(cuerpoNota).toContain(
              `<CbtesAsoc><CbteAsoc><Tipo>11</Tipo><PtoVta>1</PtoVta><Nro>${factura.number}</Nro>`,
            );
            expect(cuerpoNota).toContain("<ImpTotal>190.00</ImpTotal>");
            // Ya no queda nada para acreditar.
            await expect(
              notas.crear(user.id, org.id, branch.id, facturada.id, {
                requestId: randomUUID(),
                reason: "Otra",
                refundMethod: "CASH",
                cashSessionId: session.id,
                items: [
                  {
                    saleItemId: renglonFactura.id,
                    quantity: 1,
                    reponer: false,
                  },
                ],
              }),
            ).rejects.toThrow("supera");
            // Listado de la sucursal: la más nueva primero, con su venta.
            const listado = await notas.listar(
              user.id,
              org.id,
              branch.id,
              {},
              1,
              10,
            );
            expect(listado.total).toBe(2);
            expect(listado.items.map((n) => n.id)).toEqual([
              total.notaId,
              hecha.notaId,
            ]);
            expect(listado.items[1]).toMatchObject({
              creditKind: "INTERNA",
              sale: { id: interna.id, documentType: "INTERNAL" },
            });
            expect(listado.items[0]?.items[0]?.name).toBe("Ibuprofeno");
            expect(
              (
                await notas.listar(
                  user.id,
                  org.id,
                  branch.id,
                  { creditKind: "INTERNA" },
                  1,
                  10,
                )
              ).total,
            ).toBe(1);
            const historial = await sales.history(
              user.id,
              org.id,
              branch.id,
              {},
              1,
              10,
            );
            expect(
              historial.items.find((v) => v.id === interna.id)?.notasCredito,
            ).toBe(1);
            // Saldo a favor (cliente registrado): baja lo que debe de otra
            // compra y lo que sobra se descuenta de la próxima a cuenta.
            await tx.userBranch.create({
              data: { userId: user.id, branchId: branch.id },
            });
            const cliente = await tx.customer.create({
              data: {
                organizationId: org.id,
                name: "Cliente con cuenta",
                creditEnabled: true,
                creditLimitMinor: null,
              },
            });
            const venderA = (method: "CASH" | "ACCOUNT", cantidad: number) =>
              sales.complete(user.id, org.id, branch.id, {
                documentType: "INTERNAL",
                clientOperationId: randomUUID(),
                customerId: cliente.id,
                items: [{ productId: product.id, quantity: cantidad }],
                payments: [
                  method === "CASH"
                    ? {
                        method,
                        amountMinor: 10000 * cantidad,
                        cashSessionId: session.id,
                      }
                    : { method, amountMinor: 10000 * cantidad },
                ],
              });
            await venderA("ACCOUNT", 1);
            const contado = await venderA("CASH", 2);
            const renglonContado = await tx.saleItem.findFirstOrThrow({
              where: { saleId: contado.id },
            });
            const conSaldo = await notas.crear(
              user.id,
              org.id,
              branch.id,
              contado.id,
              {
                requestId: randomUUID(),
                reason: "Cambia por otro",
                refundMethod: "SALDO_A_FAVOR",
                items: [
                  { saleItemId: renglonContado.id, quantity: 2, reponer: true },
                ],
              },
            );
            expect(conSaldo.notas[0]).toMatchObject({
              totalMinor: "20000",
              accountMinor: "20000",
              refundMinor: "0",
              refundMethod: null,
            });
            expect(await salidas(conSaldo.notaId)).toHaveLength(0);
            const cuenta = () =>
              accounts.itemBalances(tx, user.id, org.id, cliente.id);
            let saldo = await cuenta();
            // Debía 10.000: los pagó con el saldo y quedan 10.000 a favor,
            // sin pedir conciliación.
            expect(saldo.balanceMinor).toBe("-10000");
            expect(saldo.unassignedReceipts).toHaveLength(0);
            expect(saldo.items.every((item) => item.pendingMinor === "0")).toBe(
              true,
            );
            // La próxima compra a cuenta se descuenta del saldo a favor.
            const siguiente = await venderA("ACCOUNT", 3);
            saldo = await cuenta();
            expect(saldo.balanceMinor).toBe("20000");
            expect(
              saldo.items.find((item) => item.saleId === siguiente.id)
                ?.pendingMinor,
            ).toBe("20000");
            await expect(
              notas.crear(user.id, org.id, branch.id, interna.id, {
                requestId: randomUUID(),
                reason: "Sin cliente",
                refundMethod: "SALDO_A_FAVOR",
                items: [
                  { saleItemId: renglon.id, quantity: 1, reponer: false },
                ],
              }),
            ).rejects.toThrow("cliente registrado");
            // La nota de prueba no aparece entre las pruebas sueltas.
            expect(
              await tx.fiscalTrial.count({
                where: {
                  organizationId: org.id,
                  sourceSaleId: null,
                  kind: "INVOICE",
                },
              }),
            ).toBe(0);
          } finally {
            access.mockRestore();
            points.mockRestore();
            external.mockRestore();
          }
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
