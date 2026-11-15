import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { SalesService } from "../src/sales/sales.service";
import { OffersService } from "../src/offers/offers.service";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { AccountsService } from "../src/accounts/accounts.service";
import { FiscalSalesService } from "../src/fiscal/fiscal-sales.service";
import { ProductionSalesService } from "../src/fiscal/production-sales.service";
import { ProductionCreditService } from "../src/fiscal/production-credit.service";
import { ProductionConfigurationService } from "../src/fiscal/production-configuration.service";
import { ArcaConnectionService } from "../src/fiscal/arca-connection.service";
import { ArcaSoap } from "../src/fiscal/arca-soap";
import { CredentialVault } from "../src/fiscal/credential-vault";

// Ofertas (SISTEMA-103) de punta a punta contra gestion_dev local. Cada caso
// corre dentro de una transacción que se deshace al final.
describe("ofertas (base local, transacción que se deshace)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.pathname !== "/gestion_dev"
    )
      throw new Error("Sólo la base local de desarrollo");
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  const hace = (minutos: number) =>
    new Date(Date.now() - minutos * 60_000).toISOString();

  async function escenario(
    tx: Prisma.TransactionClient,
    nombre: string,
    fiscalProfile?: Prisma.InputJsonObject,
  ) {
    const org = await tx.organization.create({
      data: { name: nombre, ...(fiscalProfile ? { fiscalProfile } : {}) },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: "Central", code: "CEN" },
    });
    const usuario = async (codigos: string[]) => {
      const user = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          passwordHash: "test",
        },
      });
      const permissions = await tx.permission.findMany({
        where: { code: { in: codigos } },
      });
      const role = await tx.role.create({
        data: {
          organizationId: org.id,
          name: `Rol ${randomUUID().slice(0, 6)}`,
          code: `R${randomUUID().slice(0, 6)}`,
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
      return user;
    };
    const dueño = await usuario([
      "SALE_MANAGE",
      "SALE_READ",
      "OFFER_READ",
      "OFFER_MANAGE",
      "CATALOG_READ",
    ]);
    const cajera = await usuario(["SALE_MANAGE", "SALE_READ"]);
    const general = await tx.priceList.create({
      data: { organizationId: org.id, name: "Precio general" },
    });
    const producto = async (
      name: string,
      precio: bigint,
      lotes: number[],
      extra: Partial<Prisma.ProductUncheckedCreateInput> = {},
    ) => {
      const product = await tx.product.create({
        data: { organizationId: org.id, name, ...extra },
      });
      await tx.productPrice.create({
        data: {
          productId: product.id,
          priceListId: general.id,
          amountMinor: precio,
        },
      });
      const lots = [];
      for (const [indice, quantity] of lotes.entries())
        lots.push(
          await tx.productLot.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              productId: product.id,
              number: `L${indice}`,
              quantity,
              unitCostMinor: precio / 2n,
              expiresAt: new Date(`2030-0${indice + 1}-01`),
            },
          }),
        );
      return { product, lots };
    };
    const register = await tx.cashRegister.create({
      data: { branchId: branch.id, name: "Caja" },
    });
    const session = await tx.cashSession.create({
      data: {
        cashRegisterId: register.id,
        openedById: dueño.id,
        openingAmountMinor: 0n,
        // Abierta antes de las ventas sin conexión de los casos.
        openedAt: new Date(Date.now() - 5 * 60 * 60_000),
      },
    });
    const scoped = new Proxy(tx, {
      get(target, key) {
        return key === "$transaction"
          ? (fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
              fn(tx)
          : Reflect.get(target, key);
      },
    }) as unknown as PrismaService;
    return {
      org,
      branch,
      dueño,
      cajera,
      general,
      producto,
      session,
      scoped,
      offers: new OffersService(scoped, new AuditService(scoped)),
    };
  }

  it("aplica, revalida, reparte entre lotes, guarda la instantánea y respeta permisos", async () => {
    const rollback = new Error("ROLLBACK_OFERTAS");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const e = await escenario(tx, "Ofertas fixture");
          const sales = new SalesService(e.scoped, new AuditService(e.scoped));
          // Dos lotes: el 2x1 se reparte entre los dos.
          const { product: shampoo, lots } = await e.producto(
            "Shampoo",
            1000n,
            [2, 5],
          );
          // Permisos: la cajera vende pero no crea ofertas.
          await expect(
            e.offers.crear(e.cajera.id, e.org.id, {
              name: "2x1 shampoo",
              type: "BUY_X_PAY_Y",
              buyQuantity: 2,
              payQuantity: 1,
              startsAt: hace(60),
              targets: [{ kind: "PRODUCT", id: shampoo.id }],
              publicar: true,
            }),
          ).rejects.toThrow("permiso");
          const dosPorUno = await e.offers.crear(e.dueño.id, e.org.id, {
            name: "2x1 shampoo",
            type: "BUY_X_PAY_Y",
            buyQuantity: 2,
            payQuantity: 1,
            startsAt: hace(60),
            targets: [{ kind: "PRODUCT", id: shampoo.id }],
            publicar: true,
          });
          expect(dosPorUno).toMatchObject({ estado: "ACTIVA", label: "2x1" });
          // Un cliente que no manda el ahorro (versión vieja) recibe 409.
          const base = {
            payments: [
              {
                method: "CASH" as const,
                amountMinor: 5000,
                cashSessionId: e.session.id,
              },
            ],
          };
          await expect(
            sales.complete(e.cajera.id, e.org.id, e.branch.id, {
              ...base,
              clientOperationId: randomUUID(),
              items: [{ productId: shampoo.id, quantity: 3 }],
            }),
          ).rejects.toMatchObject({ status: 409 });
          // Con el ahorro que vio la cajera y un descuento general encima.
          const venta = await sales.complete(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            {
              ...base,
              clientOperationId: randomUUID(),
              items: [
                {
                  productId: shampoo.id,
                  quantity: 3,
                  expectedUnitPriceMinor: "1000",
                  expectedOfferDiscountMinor: "1000",
                  discountMinor: 200,
                },
              ],
            },
          );
          expect(venta.totalMinor).toBe("1800");
          const renglones = await tx.saleItem.findMany({
            where: { saleId: venta.id },
            orderBy: { quantity: "asc" },
          });
          expect(renglones.map((item) => item.lotId).sort()).toEqual(
            [lots[0]!.id, lots[1]!.id].sort(),
          );
          expect(
            renglones.reduce(
              (suma, item) => suma + item.offerDiscountMinor,
              0n,
            ),
          ).toBe(1000n);
          expect(
            renglones.reduce((suma, item) => suma + item.discountMinor, 0n),
          ).toBe(1200n);
          for (const item of renglones)
            expect(item.offerDiscountMinor <= item.discountMinor).toBe(true);
          const instantanea = await tx.saleOffer.findFirstOrThrow({
            where: { saleId: venta.id },
            include: { items: true },
          });
          expect(instantanea).toMatchObject({
            offerId: dosPorUno.id,
            offerVersion: 1,
            label: "2x1",
            units: 2,
            discountMinor: 1000n,
          });
          const auditoria = await tx.auditLog.findFirstOrThrow({
            where: { entityType: "SALE", entityId: venta.id },
          });
          expect(JSON.stringify(auditoria.after)).toContain(dosPorUno.id);
          const ticket = await sales.ticket(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            venta.id,
          );
          expect(ticket).toMatchObject({
            subtotalMinor: "3000",
            discountMinor: "1200",
            offerDiscountMinor: "1000",
            savingsMinor: "1200",
            totalMinor: "1800",
            offers: [
              { label: "2x1", name: "2x1 shampoo", amountMinor: "1000" },
            ],
          });
          // La edición sube la versión y queda en auditoría con el antes y el
          // después; la venta conserva su instantánea.
          const editada = await e.offers.editar(
            e.dueño.id,
            e.org.id,
            dosPorUno.id,
            {
              name: "3x2 shampoo",
              type: "BUY_X_PAY_Y",
              buyQuantity: 3,
              payQuantity: 2,
              startsAt: hace(60),
              targets: [{ kind: "PRODUCT", id: shampoo.id }],
              expectedUpdatedAt: dosPorUno.updatedAt,
            },
          );
          expect(editada.version).toBe(2);
          expect(
            (
              await tx.saleOffer.findFirstOrThrow({
                where: { saleId: venta.id },
              })
            ).name,
          ).toBe("2x1 shampoo");
          const cambio = await tx.auditLog.findFirstOrThrow({
            where: { entityId: dosPorUno.id, action: "OFFER_UPDATED" },
          });
          expect(JSON.stringify(cambio.before)).toContain("2x1 shampoo");
          expect(JSON.stringify(cambio.after)).toContain("3x2 shampoo");
          await expect(
            e.offers.editar(e.dueño.id, e.org.id, dosPorUno.id, {
              name: "Otra",
              type: "BUY_X_PAY_Y",
              buyQuantity: 3,
              payQuantity: 2,
              startsAt: hace(60),
              targets: [{ kind: "PRODUCT", id: shampoo.id }],
              expectedUpdatedAt: dosPorUno.updatedAt,
            }),
          ).rejects.toMatchObject({ status: 409 });
          // Si la pausan mientras la cajera cobra, la API avisa con 409.
          await e.offers.cambiarEstado(
            e.dueño.id,
            e.org.id,
            dosPorUno.id,
            "pausar",
          );
          await expect(
            sales.complete(e.cajera.id, e.org.id, e.branch.id, {
              ...base,
              clientOperationId: randomUUID(),
              items: [
                {
                  productId: shampoo.id,
                  quantity: 3,
                  expectedOfferDiscountMinor: "1000",
                },
              ],
            }),
          ).rejects.toMatchObject({
            status: 409,
            response: expect.objectContaining({ error: "OFERTAS_CAMBIARON" }),
          });
          const detalle = await e.offers.detalle(
            e.dueño.id,
            e.org.id,
            dosPorUno.id,
          );
          expect(detalle.estado).toBe("PAUSADA");
          expect(detalle.stats).toMatchObject({
            ventas: 1,
            unidades: 2,
            descuentoMinor: "1000",
            facturacionMinor: "1000",
          });
          expect(detalle.ventas).toHaveLength(1);
          expect(detalle.historial.map((item) => item.action)).toEqual(
            expect.arrayContaining([
              "OFFER_CREATED",
              "OFFER_UPDATED",
              "OFFER_PAUSED",
            ]),
          );
          // Una oferta usada no se borra: se finaliza y se archiva.
          await e.offers.cambiarEstado(
            e.dueño.id,
            e.org.id,
            dosPorUno.id,
            "finalizar",
          );
          await e.offers.cambiarEstado(
            e.dueño.id,
            e.org.id,
            dosPorUno.id,
            "archivar",
          );
          expect(await tx.offer.count({ where: { id: dosPorUno.id } })).toBe(1);
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  });

  it("categoría con subcategorías, precio manual, tope total y venta sin conexión", async () => {
    const rollback = new Error("ROLLBACK_OFERTAS_2");
    await expect(
      prisma.$transaction(
        async (tx) => {
          const e = await escenario(tx, "Ofertas fixture 2");
          const sales = new SalesService(e.scoped, new AuditService(e.scoped));
          const padre = await tx.category.create({
            data: { organizationId: e.org.id, name: "Solares" },
          });
          const hija = await tx.category.create({
            data: {
              organizationId: e.org.id,
              name: "Niños",
              parentId: padre.id,
            },
          });
          const { product: protector } = await e.producto(
            "Protector",
            2000n,
            [10],
            {
              categoryId: hija.id,
              isMedication: true,
              prescriptionRequired: true,
            },
          );
          await e.offers.crear(e.dueño.id, e.org.id, {
            name: "Solares 10%",
            type: "PERCENT",
            percentBps: 1000,
            startsAt: hace(60),
            maxUnitsTotal: 2,
            targets: [{ kind: "CATEGORY", id: padre.id }],
            publicar: true,
          });
          const pago = (monto: number) => [
            {
              method: "CASH" as const,
              amountMinor: monto,
              cashSessionId: e.session.id,
            },
          ];
          // Precio manual: reemplaza la oferta.
          const manual = await sales.complete(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            {
              clientOperationId: randomUUID(),
              items: [
                {
                  productId: protector.id,
                  quantity: 1,
                  expectedUnitPriceMinor: "2000",
                  requestedUnitPriceMinor: 1500,
                  expectedOfferDiscountMinor: "0",
                },
              ],
              payments: pago(1500),
            },
          );
          expect(
            await tx.saleOffer.count({ where: { saleId: manual.id } }),
          ).toBe(0);
          // La categoría padre incluye la subcategoría; tope total de 2.
          const primera = await sales.complete(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            {
              clientOperationId: randomUUID(),
              items: [
                {
                  productId: protector.id,
                  quantity: 2,
                  expectedOfferDiscountMinor: "400",
                },
              ],
              payments: pago(3600),
            },
          );
          expect(primera.totalMinor).toBe("3600");
          // Tope agotado: la siguiente venta ya no lleva oferta.
          const segunda = await sales.complete(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            {
              clientOperationId: randomUUID(),
              items: [
                {
                  productId: protector.id,
                  quantity: 1,
                  expectedOfferDiscountMinor: "0",
                },
              ],
              payments: pago(2000),
            },
          );
          expect(segunda.totalMinor).toBe("2000");

          // Sin conexión: una oferta que venció por fecha antes de sincronizar
          // pero estaba vigente a la hora de la venta: se respeta sin aviso.
          const { product: crema } = await e.producto("Crema", 1000n, [10]);
          await e.offers.crear(e.dueño.id, e.org.id, {
            name: "Crema 20%",
            type: "PERCENT",
            percentBps: 2000,
            startsAt: hace(180),
            endsAt: hace(30),
            targets: [{ kind: "PRODUCT", id: crema.id }],
            publicar: true,
          });
          const offlineVigente = randomUUID();
          await sales.completeOffline(e.cajera.id, e.org.id, e.branch.id, {
            clientOperationId: offlineVigente,
            occurredAt: hace(60),
            deviceId: randomUUID(),
            items: [
              {
                productId: crema.id,
                quantity: 1,
                expectedUnitPriceMinor: "1000",
                expectedOfferDiscountMinor: "200",
              },
            ],
            payments: pago(800),
          });
          expect(
            await tx.offlineSyncIssue.count({
              where: { operationId: offlineVigente },
            }),
          ).toBe(0);
          expect(
            await tx.saleOffer.count({ where: { saleId: offlineVigente } }),
          ).toBe(1);

          // Finalizada a mano antes de sincronizar: se respeta lo cobrado y
          // queda el aviso "a revisar".
          const { product: gel } = await e.producto("Gel", 1000n, [10]);
          const gelOferta = await e.offers.crear(e.dueño.id, e.org.id, {
            name: "Gel 2da al 50%",
            type: "NTH_UNIT_PERCENT",
            nthUnit: 2,
            percentBps: 5000,
            startsAt: hace(180),
            targets: [{ kind: "PRODUCT", id: gel.id }],
            publicar: true,
          });
          await e.offers.cambiarEstado(
            e.dueño.id,
            e.org.id,
            gelOferta.id,
            "finalizar",
          );
          const offlineFinalizada = randomUUID();
          const sincronizada = await sales.completeOffline(
            e.cajera.id,
            e.org.id,
            e.branch.id,
            {
              clientOperationId: offlineFinalizada,
              occurredAt: hace(60),
              deviceId: randomUUID(),
              items: [
                {
                  productId: gel.id,
                  quantity: 2,
                  expectedUnitPriceMinor: "1000",
                  expectedOfferDiscountMinor: "500",
                },
              ],
              appliedOffers: [
                {
                  offerId: gelOferta.id,
                  version: 1,
                  items: [
                    {
                      productId: gel.id,
                      units: 2,
                      grossMinor: "2000",
                      discountMinor: "500",
                    },
                  ],
                },
              ],
              payments: pago(1500),
            },
          );
          expect(sincronizada.totalMinor).toBe("1500");
          expect(sincronizada.offlineIssues.map((item) => item.kind)).toEqual([
            "OFERTA_DISTINTA",
          ]);
          expect(
            await tx.saleOffer.count({ where: { saleId: offlineFinalizada } }),
          ).toBe(1);
          throw rollback;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(rollback);
  });

  it("factura C con un 2x1 y nota de crédito parcial por lo efectivamente pagado", async () => {
    const previous = process.env.FISCAL_PRODUCTION_ISSUANCE;
    process.env.FISCAL_PRODUCTION_ISSUANCE = "enabled";
    const rollback = new Error("ROLLBACK_OFERTAS_FISCAL");
    try {
      await expect(
        prisma.$transaction(
          async (tx) => {
            const profile = {
              legalName: "Ofertas fiscal fixture",
              cuit: "20247237837",
              vatCondition: "MONOTAX",
              address: "Test",
              city: "Test",
              province: "Test",
              activityStart: "2026-01-01",
              grossIncomeId: "20247237837",
            };
            const e = await escenario(tx, "Ofertas fiscal", profile);
            await tx.fiscalCredential.create({
              data: {
                organizationId: e.org.id,
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
                organizationId: e.org.id,
                branchId: e.branch.id,
                point: 99997,
                issuerCuit: profile.cuit,
                credentialVersion: 1,
                enabled: true,
                exclusiveConfirmed: true,
                activatedAt: new Date(),
              },
            });
            const { product } = await e.producto("Jabón", 10000n, [10]);
            await e.offers.crear(e.dueño.id, e.org.id, {
              name: "2x1 jabón",
              type: "BUY_X_PAY_Y",
              buyQuantity: 2,
              payQuantity: 1,
              startsAt: hace(60),
              targets: [{ kind: "PRODUCT", id: product.id }],
              publicar: true,
            });
            const organizations = new OrganizationsService(e.scoped);
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
              e.scoped,
              organizations,
              connection,
              vault,
            );
            const soap = new ArcaSoap();
            const last = new Map<number, number>();
            const enviados: string[] = [];
            jest
              .spyOn(soap, "call")
              .mockImplementation(async (_kind, operation, body) => {
                const value = (tag: string) =>
                  new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(body)?.[1] ?? "";
                const type = Number(value("CbteTipo"));
                if (operation === "FECompUltimoAutorizado")
                  return {
                    CbteNro: String(last.get(type) ?? 0),
                    PtoVta: "99997",
                    CbteTipo: String(type),
                  };
                if (operation === "FECAESolicitar") {
                  enviados.push(body);
                  last.set(type, Number(value("CbteDesde")));
                  return {
                    FeCabResp: {
                      Cuit: profile.cuit,
                      PtoVta: "99997",
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
                throw new Error("Operación externa inesperada");
              });
            const production = new ProductionSalesService(
              e.scoped,
              config,
              connection,
              soap,
              organizations,
            );
            const sales = new SalesService(
              e.scoped,
              new AuditService(e.scoped),
              app.get(FiscalSalesService),
              production,
              config,
            );
            const credits = new ProductionCreditService(
              e.scoped,
              production,
              config,
              organizations,
              new AccountsService(e.scoped, new AuditService(e.scoped)),
            );
            const venta = await sales.complete(
              e.dueño.id,
              e.org.id,
              e.branch.id,
              {
                documentType: "INVOICE",
                fiscalEnvironment: "PRODUCTION",
                confirmProduction: true,
                clientOperationId: randomUUID(),
                fiscalOptions: {
                  recipient: "FINAL_CONSUMER",
                  voucherType: 11,
                },
                items: [
                  {
                    productId: product.id,
                    quantity: 2,
                    expectedOfferDiscountMinor: "10000",
                  },
                ],
                payments: [
                  {
                    method: "CASH",
                    amountMinor: 10000,
                    cashSessionId: e.session.id,
                  },
                ],
              },
            );
            expect(venta.totalMinor).toBe("10000");
            const factura = await tx.fiscalDocument.findFirstOrThrow({
              where: { sourceSaleId: venta.id, kind: "INVOICE" },
            });
            expect(factura.status).toBe("AUTHORIZED");
            expect(factura.totalMinor).toBe(10000);
            expect(enviados[0]).toContain("<ImpTotal>100.00</ImpTotal>");
            const item = await tx.saleItem.findFirstOrThrow({
              where: { saleId: venta.id },
            });
            // Devolver 1 de las 2 unidades devuelve la mitad de lo pagado.
            const nota = await credits.create(
              e.dueño.id,
              e.org.id,
              e.branch.id,
              venta.id,
              {
                requestId: randomUUID(),
                reason: "Devolución parcial del 2x1",
                confirmProduction: true,
                items: [{ saleItemId: item.id, quantity: 1 }],
              },
            );
            expect(nota.status).toBe("AUTHORIZED");
            expect(nota.totalMinor).toBe(5000);
            throw rollback;
          },
          { timeout: 60_000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      if (previous === undefined) delete process.env.FISCAL_PRODUCTION_ISSUANCE;
      else process.env.FISCAL_PRODUCTION_ISSUANCE = previous;
    }
  });
});
