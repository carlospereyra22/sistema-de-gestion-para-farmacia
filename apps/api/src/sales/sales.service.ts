import { reopenForHistoricStock } from "../catalog/branch-product-lifecycle";
import { accountDueDate } from "../accounts/account-due-date";
import { lockCashSession } from "../cash/lock-cash-session";
import { recordPendingCollection } from "../cash/pending-collection";
import { assertCollectionSession } from "../cash/cash-settings";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  offlineConceptName,
  offlineOccurredAt,
  offlineRequestHash,
  type OfflineSaleContext,
} from "./offline-sale";
import { subscriptionAccessAt } from "../platform/subscription-access";
import { subscriptionDenied } from "../platform/subscription-gate";
import { CashMovementType, PaymentMethod, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { stockAvailability } from "../inventory/stock-availability";
import { allocateSaleLots } from "./sale-lot-allocation";
import type { ThermalTicket } from "@gestion/contracts";
import { groupTicketItems } from "./group-ticket-items";
import { manualConcept } from "./manual-concept";
import { saleUnitPrice } from "./sale-unit-price";
import type {
  SaleFiscalOptions,
  SaleFiscalCapabilities,
} from "@gestion/contracts";
import { readFiscalProfile } from "../organizations/fiscal-profile";
import { fiscalReadiness } from "../organizations/fiscal-readiness";
import { organizationTicketStore } from "../organizations/ticket-header";
import { FiscalSalesService } from "../fiscal/fiscal-sales.service";
import { ProductionSalesService } from "../fiscal/production-sales.service";
import { ProductionConfigurationService } from "../fiscal/production-configuration.service";
import { productionIssuanceAvailable } from "../fiscal/production-document";
import { obj, str, list } from "../fiscal/arca-soap";

type SaleInput = {
  fiscalEnvironment?: "HOMOLOGATION" | "PRODUCTION";
  confirmProduction?: boolean;
  fiscalOptions?: SaleFiscalOptions;
  documentType?: "INTERNAL" | "INVOICE";
  confirmHomologation?: boolean;
  priceListId?: string;
  clientOperationId?: string;
  customerId?: string;
  items: {
    productId?: string;
    description?: string;
    unitPriceMinor?: number;
    quantity: number;
    discountMinor?: number;
    expectedUnitPriceMinor?: string;
    requestedUnitPriceMinor?: number;
    packQuantity?: number;
    /** Sin conexión: nombre visto en la PC, por si el producto ya no se vende. */
    productName?: string;
  }[];
  payments: {
    method: PaymentMethod;
    amountMinor: number;
    cashSessionId?: string;
  }[];
};

export type OfflineSaleInput = SaleInput & {
  clientOperationId: string;
  occurredAt: string;
  deviceId: string;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly fiscal?: FiscalSalesService,
    @Optional() private readonly production?: ProductionSalesService,
    @Optional()
    private readonly productionConfiguration?: ProductionConfigurationService,
  ) {}

  async fiscalOptions(
    actor: string,
    org: string,
    branch: string,
  ): Promise<SaleFiscalCapabilities> {
    await this.assert(actor, org, "SALE_MANAGE");
    await this.ensureBranch(org, branch);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: org },
    });
    const supported = ["MONOTAX", "EXEMPT"].includes(
      readFiscalProfile(organization.fiscalProfile).vatCondition,
    );
    const activated = await this.prisma.fiscalProductionConfiguration.findFirst(
      { where: { organizationId: org, branchId: branch, enabled: true } },
    );
    if (activated) {
      try {
        if (!this.productionConfiguration) throw new Error();
        await this.productionConfiguration.validate(this.prisma, org, branch);
        return {
          environment: "PRODUCTION",
          voucherTypes: [{ code: 11, label: "Factura C" }],
          reason: null,
        };
      } catch {
        return {
          environment: "PRODUCTION",
          voucherTypes: [],
          reason:
            "La sucursal tiene producción activada, pero falta verificar su disponibilidad, certificado o perfil. No se vuelve a pruebas automáticamente.",
        };
      }
    }
    const profile = readFiscalProfile(organization.fiscalProfile);
    const [points, credential] = await Promise.all([
      this.prisma.fiscalPoint.findMany({
        where: {
          organizationId: org,
          branchId: branch,
          environment: "HOMOLOGATION",
          active: true,
        },
      }),
      this.prisma.fiscalCredential.findUnique({
        where: {
          organizationId_environment: {
            organizationId: org,
            environment: "HOMOLOGATION",
          },
        },
        select: { certificate: true, expiresAt: true, representedCuit: true },
      }),
    ]);
    const configured = Boolean(
      fiscalReadiness(profile, 1).checks[0]?.ready &&
      points.length === 1 &&
      credential?.certificate &&
      credential.expiresAt &&
      credential.expiresAt.getTime() > Date.now() &&
      credential.representedCuit === profile.cuit,
    );
    return {
      environment: "HOMOLOGATION",
      voucherTypes:
        supported && configured ? [{ code: 11, label: "Factura C" }] : [],
      reason: supported
        ? configured
          ? null
          : "Completá el perfil fiscal, el certificado vigente y el punto de venta de esta sucursal en Organización → Facturación."
        : "El circuito de Ventas admite factura C para monotributo/exento. Otros tipos requieren configurar los impuestos del emisor y los productos.",
    };
  }

  async list(actorId: string, organizationId: string, branchId: string) {
    await this.assert(actorId, organizationId, "SALE_READ");
    return this.prisma.sale
      .findMany({
        where: { organizationId, branchId },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          items: true,
          payments: true,
          fiscalTrial: true,
          // El historial muestra el número de ARCA de la factura (SISTEMA-64).
          fiscalDocuments: {
            where: { kind: "INVOICE" },
            select: {
              status: true,
              point: true,
              number: true,
              voucherType: true,
            },
          },
        },
      })
      .then((sales) => sales.map((sale) => this.serialize(sale)));
  }

  async invoice(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
    process = false,
  ) {
    await this.assert(
      actorId,
      organizationId,
      process ? "SALE_MANAGE" : "SALE_READ",
    );
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId, branchId },
      include: { fiscalTrial: true },
    });
    if (sale && this.production) {
      const document = await this.prisma.fiscalDocument.findFirst({
        where: {
          sourceSaleId: saleId,
          organizationId,
          branchId,
          kind: "INVOICE",
        },
      });
      if (document)
        return {
          ...(process
            ? await this.production.process(
                actorId,
                organizationId,
                branchId,
                saleId,
              )
            : this.production.present(document)),
          ticket: await this.buildTicket(
            organizationId,
            branchId,
            saleId,
            true,
          ),
        };
    }
    if (!sale?.fiscalTrial)
      throw new NotFoundException("Factura de homologación no encontrada.");
    const trial =
      process && this.fiscal
        ? await this.fiscal.process(actorId, organizationId, branchId, saleId)
        : sale.fiscalTrial;
    return {
      ...trial,
      ticket: await this.buildTicket(organizationId, branchId, saleId, true),
    };
  }

  /**
   * Vuelve a emitir la factura rechazada de una venta (o la que no llegó a
   * ARCA): la pone en cola en el mismo registro y la envía.
   */
  async requeueInvoice(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId, branchId },
      include: { fiscalTrial: true },
    });
    if (!sale) throw new NotFoundException("Venta no encontrada.");
    const document = this.production
      ? await this.prisma.fiscalDocument.findFirst({
          where: {
            sourceSaleId: saleId,
            organizationId,
            branchId,
            kind: "INVOICE",
          },
          select: { id: true },
        })
      : null;
    if (document && this.production)
      await this.production.requeue(actorId, organizationId, branchId, saleId);
    else if (sale.fiscalTrial && this.fiscal)
      await this.fiscal.requeue(actorId, organizationId, branchId, saleId);
    else throw new NotFoundException("La venta no tiene factura.");
    return this.invoice(actorId, organizationId, branchId, saleId, true);
  }

  async ticket(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
  ): Promise<ThermalTicket> {
    await this.assert(actorId, organizationId, "SALE_READ");
    return this.buildTicket(organizationId, branchId, saleId, false);
  }

  private async buildTicket(
    organizationId: string,
    branchId: string,
    saleId: string,
    invoice: boolean,
  ): Promise<ThermalTicket> {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        organizationId,
        branchId,
        status: { in: ["COMPLETED", "CANCELLED"] },
      },
      include: { items: true, payments: true, fiscalTrial: true },
    });
    if (!sale || !sale.completedAt)
      throw new NotFoundException("Comprobante no encontrado.");
    if (sale.documentType === "INVOICE" && !invoice)
      throw new BadRequestException(
        "Usá el comprobante de homologación de esta venta, no el ticket interno.",
      );
    const [branch, products, customer, audit] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: branchId, organizationId },
        include: { organization: true },
      }),
      this.prisma.product.findMany({
        where: {
          organizationId,
          id: {
            in: sale.items.flatMap((item) =>
              item.productId ? [item.productId] : [],
            ),
          },
        },
        select: { id: true, name: true },
      }),
      sale.customerId
        ? this.prisma.customer.findFirst({
            where: { id: sale.customerId, organizationId },
            select: { name: true },
          })
        : null,
      this.prisma.auditLog.findFirst({
        where: {
          organizationId,
          branchId,
          entityType: "SALE",
          entityId: sale.id,
          action: "COMPLETED",
        },
        orderBy: { createdAt: "asc" },
        select: { actorId: true },
      }),
    ]);
    const cashier = audit?.actorId
      ? await this.prisma.userOrganization.findUnique({
          where: {
            userId_organizationId: { userId: audit.actorId, organizationId },
          },
          select: { displayName: true },
        })
      : null;
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const subtotal = sale.items.reduce(
      (sum, item) => sum + item.unitPriceMinor * BigInt(item.quantity),
      0n,
    );
    const discount = sale.items.reduce(
      (sum, item) => sum + item.discountMinor,
      0n,
    );
    const paid = sale.payments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0n,
    );
    const cash = sale.payments
      .filter((payment) => payment.method === "CASH")
      .reduce((sum, payment) => sum + payment.amountMinor, 0n);
    const productionDocument = invoice
      ? await this.prisma.fiscalDocument.findFirst({
          where: {
            sourceSaleId: saleId,
            organizationId,
            branchId,
            kind: "INVOICE",
          },
        })
      : null;
    const snapshot = invoice
      ? obj(productionDocument?.saleSnapshot ?? sale.fiscalTrial?.saleSnapshot)
      : {};
    const savedStore = obj(snapshot.store);
    const snapshotItems = list(snapshot.items).map(obj);
    return {
      kind: "sale",
      id: sale.id,
      number: sale.id.slice(0, 8).toUpperCase(),
      date: sale.completedAt.toISOString(),
      store: str(savedStore.name)
        ? {
            name: str(savedStore.name),
            address: str(savedStore.address),
            contact: str(savedStore.contact),
            logoRaster: str(savedStore.logoRaster) || undefined,
          }
        : organizationTicketStore(branch?.organization),
      branch: str(snapshot.branchName) || branch?.name || "",
      customer:
        str(obj(snapshot.recipient).name) ||
        customer?.name ||
        "Público general",
      cashier: str(snapshot.cashier) || cashier?.displayName || undefined,
      cancelled: sale.status === "CANCELLED",
      items: snapshotItems.length
        ? snapshotItems.map((item) => ({
            name: str(item.name),
            quantity: Number(item.quantity),
            unitPriceMinor: str(item.unitPriceMinor),
            amountMinor: (
              BigInt(str(item.unitPriceMinor)) * BigInt(Number(item.quantity))
            ).toString(),
          }))
        : groupTicketItems(sale.items).map((item) => ({
            name:
              item.description ??
              names.get(item.productId ?? "") ??
              item.productId ??
              "Concepto",
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor.toString(),
            amountMinor: (
              item.unitPriceMinor * BigInt(item.quantity)
            ).toString(),
          })),
      subtotalMinor: subtotal.toString(),
      discountMinor: discount.toString(),
      totalMinor: sale.totalMinor.toString(),
      payments: sale.payments.map((payment) => ({
        method: payment.method,
        amountMinor: payment.amountMinor.toString(),
      })),
      ...(cash > 0n
        ? {
            receivedMinor: cash.toString(),
            changeMinor: (paid > sale.totalMinor
              ? paid - sale.totalMinor
              : 0n
            ).toString(),
          }
        : {}),
    };
  }

  /**
   * Venta hecha sin conexión que la PC manda al volver (SISTEMA-63). Se acepta
   * según el estado de la farmacia cuando ocurrió, queda con su fecha real y
   * lo que haya cambiado mientras tanto se registra como aviso "a revisar".
   */
  async completeOffline(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: OfflineSaleInput,
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    const occurredAt = offlineOccurredAt(input.occurredAt, new Date());
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (subscription) {
      const { access, stage } = subscriptionAccessAt(subscription, occurredAt);
      if (access !== "FULL")
        throw subscriptionDenied(
          access === "READ_ONLY" ? "READ_ONLY" : "BLOCKED",
          stage,
        );
    }
    const sale = await this.complete(actorId, organizationId, branchId, input, {
      occurredAt,
      deviceId: input.deviceId,
      requestHash: offlineRequestHash(input),
      issues: [],
    });
    const issues = await this.prisma.offlineSyncIssue.findMany({
      where: { organizationId, operationId: input.clientOperationId },
      orderBy: { createdAt: "asc" },
    });
    return {
      ...sale,
      offlineIssues: issues.map((issue) => ({
        id: issue.id,
        kind: issue.kind,
        status: issue.status,
        detail: issue.detail,
      })),
    };
  }

  /** Avisos de lo sincronizado sin conexión; por defecto, sólo los abiertos. */
  async offlineIssues(
    actorId: string,
    organizationId: string,
    branchId: string,
    includeResolved = false,
  ) {
    await this.assert(actorId, organizationId, "SALE_READ");
    const issues = await this.prisma.offlineSyncIssue.findMany({
      where: {
        organizationId,
        branchId,
        ...(includeResolved ? {} : { status: "OPEN" }),
      },
      include: {
        operation: { select: { occurredAt: true, deviceId: true } },
        sale: { select: { totalMinor: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return issues.map((issue) => ({
      id: issue.id,
      kind: issue.kind,
      status: issue.status,
      detail: issue.detail,
      saleId: issue.saleId,
      saleTotalMinor: issue.sale?.totalMinor.toString() ?? null,
      saleStatus: issue.sale?.status ?? null,
      occurredAt: issue.operation.occurredAt,
      deviceId: issue.operation.deviceId,
      createdAt: issue.createdAt,
      resolvedAt: issue.resolvedAt,
      resolutionNote: issue.resolutionNote,
    }));
  }

  /** Marca un aviso como revisado. No cambia la venta ni el stock. */
  async resolveOfflineIssue(
    actorId: string,
    organizationId: string,
    branchId: string,
    issueId: string,
    note?: string,
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.offlineSyncIssue.findFirst({
        where: { id: issueId, organizationId, branchId },
      });
      if (!issue) throw new NotFoundException("Aviso no encontrado.");
      if (issue.status !== "OPEN")
        throw new ConflictException("Este aviso ya estaba revisado.");
      const resolutionNote = note?.trim() || null;
      const resolved = await tx.offlineSyncIssue.update({
        where: { id: issue.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedById: actorId,
          resolutionNote,
        },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "OFFLINE_SYNC_ISSUE",
        entityId: issue.id,
        action: "RESOLVED",
        before: { status: issue.status },
        after: { status: "RESOLVED", note: resolutionNote },
      });
      return {
        id: resolved.id,
        status: resolved.status,
        resolvedAt: resolved.resolvedAt,
        resolutionNote: resolved.resolutionNote,
      };
    });
  }

  async complete(
    actorId: string,
    organizationId: string,
    branchId: string,
    input: SaleInput,
    offline?: OfflineSaleContext,
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    const isProduction = input.fiscalEnvironment === "PRODUCTION";
    if (
      input.documentType === "INVOICE" &&
      (!input.clientOperationId ||
        (isProduction
          ? !this.production ||
            !input.confirmProduction ||
            input.confirmHomologation ||
            // Sin conexión la factura queda en la cola fiscal: sale cuando
            // la emisión esté habilitada.
            (!offline && !productionIssuanceAvailable())
          : !this.fiscal ||
            !input.confirmHomologation ||
            input.confirmProduction))
    )
      throw new BadRequestException(
        "Confirmá explícitamente el ambiente fiscal disponible y la operación. No se registró ninguna venta ni cobro.",
      );
    if (!input.items.length || !input.payments.length)
      throw new BadRequestException("A sale needs items and payments.");
    if (
      new Set(
        input.items
          .filter((item) => item.productId)
          .map((item) => item.productId),
      ).size !== input.items.filter((item) => item.productId).length
    )
      throw new BadRequestException("A product can only appear once per sale.");
    await this.ensureBranch(organizationId, branchId);
    const customer = input.customerId
      ? await this.prisma.customer.findFirst({
          where: {
            id: input.customerId,
            organizationId,
            // Sin conexión la venta ya se hizo: un cliente dado de baja
            // mientras tanto no la anula, queda como aviso.
            ...(offline ? {} : { active: true }),
          },
          select: {
            active: true,
            priceListId: true,
            creditEnabled: true,
            creditLimitMinor: true,
          },
        })
      : undefined;
    if (input.customerId && !customer)
      throw new NotFoundException("El cliente no está disponible.");
    if (offline && customer && !customer.active)
      offline.issues.push({
        kind: "CLIENTE_INACTIVO",
        detail: { customerId: input.customerId ?? null },
      });
    const generalPriceList = await this.prisma.priceList.findFirst({
      where: { organizationId, name: "Precio general", active: true },
      select: { id: true },
    });
    const priceListId =
      input.priceListId || customer?.priceListId || generalPriceList?.id;
    if (!priceListId)
      throw new NotFoundException("General price list is unavailable.");
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Sin conexión: el mismo envío repetido devuelve la venta original;
          // el mismo identificador con otro contenido es un error de la PC.
          if (offline) {
            const operation = await tx.offlineOperation.findFirst({
              where: { id: input.clientOperationId, organizationId },
            });
            if (operation) {
              if (operation.requestHash !== offline.requestHash)
                throw new ConflictException(
                  "Esta venta sin conexión ya se registró con otros datos. Revisala en el historial de ventas.",
                );
              const original = await tx.sale.findFirst({
                where: { id: operation.entityId ?? undefined, organizationId },
                include: { items: true, payments: true, fiscalTrial: true },
              });
              if (original) return this.serialize(original);
            }
          }
          if (input.clientOperationId) {
            const existing = await tx.sale.findFirst({
              where: {
                organizationId,
                clientOperationId: input.clientOperationId,
              },
              include: { items: true, payments: true, fiscalTrial: true },
            });
            if (existing) {
              if (input.documentType === "INVOICE") {
                const productionDocument = await tx.fiscalDocument.findFirst({
                  where: {
                    sourceSaleId: existing.id,
                    organizationId,
                    kind: "INVOICE",
                  },
                });
                if (Boolean(productionDocument) !== isProduction)
                  throw new BadRequestException(
                    "La operación ya pertenece a otro ambiente fiscal; consultá la venta original.",
                  );
              }
              if (
                existing.branchId !== branchId ||
                existing.documentType !== (input.documentType ?? "INTERNAL")
              )
                throw new BadRequestException(
                  "Esta operación ya pertenece a otra sucursal o tipo de comprobante.",
                );
              return this.serialize(existing);
            }
          }
          const selectedPriceList = await tx.priceList.findFirst({
            where: { id: priceListId, organizationId, active: true },
          });
          let documentType = input.documentType ?? "INTERNAL";
          if (
            documentType === "INVOICE" &&
            !isProduction &&
            (await tx.fiscalProductionConfiguration.findFirst({
              where: { organizationId, branchId, enabled: true },
            }))
          ) {
            const reason =
              "Esta sucursal usa producción. Actualizá Ventas; no se registra una nueva factura de prueba.";
            if (!offline) throw new BadRequestException(reason);
            // Sin conexión se pidió factura de prueba y la sucursal pasó a
            // producción: queda como ticket para facturarla a mano.
            documentType = "INTERNAL";
            offline.issues.push({
              kind: "FACTURA_NO_PREPARADA",
              detail: { motivo: reason },
            });
          }
          if (input.priceListId && !selectedPriceList) {
            if (!offline) throw new NotFoundException("Lista no disponible.");
            // Los precios cobrados se respetan igual; sólo se avisa.
            offline.issues.push({
              kind: "LISTA_INACTIVA",
              detail: { priceListId: input.priceListId },
            });
          }
          const fallbackPriceList = selectedPriceList?.fallbackPriceListId
            ? await tx.priceList.findFirst({
                where: {
                  id: selectedPriceList.fallbackPriceListId,
                  organizationId,
                  active: true,
                },
              })
            : null;
          const items: {
            productId: string | null;
            description?: string;
            lotId: string | null;
            quantity: number;
            unitPriceMinor: bigint;
            discountMinor: bigint;
          }[] = [];
          const priceOverrides: {
            productId: string;
            originalUnitPriceMinor: string;
            unitPriceMinor: string;
            quantity: number;
            reason: string;
          }[] = [];
          for (const line of input.items) {
            if (line.requestedUnitPriceMinor !== undefined && !line.productId)
              throw new BadRequestException(
                "El precio especial sólo corresponde a productos del catálogo.",
              );
            const concept = manualConcept(line);
            if (concept) {
              items.push(concept);
              continue;
            }
            const product = await tx.product.findFirst({
              where: {
                id: line.productId,
                organizationId,
                active: true,
                branchStates: { none: { branchId, status: { not: "ACTIVE" } } },
              },
              include: {
                prices: {
                  where: {
                    priceListId,
                    priceList: { organizationId, active: true },
                  },
                  take: 1,
                },
              },
            });
            if (!product) {
              if (!offline)
                throw new BadRequestException(
                  "El producto ya no está disponible para vender en esta sucursal. Actualizá el catálogo.",
                );
              // Se archivó o desactivó mientras no había conexión: se registra
              // como concepto con el nombre y el precio cobrados, sin stock.
              const charged = BigInt(
                line.requestedUnitPriceMinor ??
                  line.expectedUnitPriceMinor ??
                  0,
              );
              if (charged < 1n)
                throw new BadRequestException(
                  "Un producto que ya no se vende necesita su precio cobrado para registrar la venta sin conexión.",
                );
              const description = offlineConceptName(line.productName);
              items.push({
                productId: null,
                lotId: null,
                description,
                quantity: line.quantity,
                unitPriceMinor: charged,
                discountMinor: BigInt(line.discountMinor ?? 0),
              });
              offline.issues.push({
                kind: "PRODUCTO_NO_DISPONIBLE",
                detail: {
                  productId: line.productId ?? null,
                  nombre: description,
                  cantidad: line.quantity,
                },
              });
              continue;
            }
            const price =
              product?.prices[0] ??
              (product && fallbackPriceList
                ? await tx.productPrice.findUnique({
                    where: {
                      productId_priceListId: {
                        productId: product.id,
                        priceListId: fallbackPriceList.id,
                      },
                    },
                  })
                : null) ??
              (product && generalPriceList
                ? await tx.productPrice.findUnique({
                    where: {
                      productId_priceListId: {
                        productId: product.id,
                        priceListId: generalPriceList.id,
                      },
                    },
                  })
                : null);
            let basePriceMinor: bigint;
            if (offline) {
              // Sin conexión se respeta el precio cobrado; si cambió (por
              // ejemplo, la actualización de las 9 o las 17), queda el aviso.
              if (
                line.expectedUnitPriceMinor === undefined ||
                !/^\d+$/.test(line.expectedUnitPriceMinor)
              )
                throw new BadRequestException(
                  "Falta el precio cobrado de un producto de la venta sin conexión.",
                );
              basePriceMinor = BigInt(line.expectedUnitPriceMinor);
              if (!price || price.amountMinor !== basePriceMinor)
                offline.issues.push({
                  kind: "PRECIO_DISTINTO",
                  detail: {
                    productId: product.id,
                    nombre: product.name,
                    cobradoMinor: basePriceMinor.toString(),
                    actualMinor: price?.amountMinor.toString() ?? null,
                  },
                });
            } else {
              if (!price)
                throw new NotFoundException(
                  "Product or its price is unavailable.",
                );
              if (
                line.expectedUnitPriceMinor !== undefined &&
                line.expectedUnitPriceMinor !== price.amountMinor.toString()
              )
                throw new BadRequestException(
                  "El precio cambió. Actualizá los precios y revisá el cobro antes de confirmar.",
                );
              basePriceMinor = price.amountMinor;
            }
            const unitPriceMinor = saleUnitPrice(
              basePriceMinor,
              line.requestedUnitPriceMinor,
              offline ? basePriceMinor.toString() : line.expectedUnitPriceMinor,
            );
            if (unitPriceMinor !== basePriceMinor)
              priceOverrides.push({
                productId: product.id,
                originalUnitPriceMinor: basePriceMinor.toString(),
                unitPriceMinor: unitPriceMinor.toString(),
                quantity: line.quantity,
                reason: "Descuento especial por producto",
              });
            const lineDiscountMinor = BigInt(line.discountMinor ?? 0);
            const lineSubtotalMinor = unitPriceMinor * BigInt(line.quantity);
            if (lineDiscountMinor > lineSubtotalMinor)
              throw new BadRequestException(
                `Discount cannot exceed the subtotal for ${product.name}.`,
              );
            let remaining = line.quantity;
            let assignedDiscountMinor = 0n;
            const physicalLots = await tx.productLot.findMany({
              where: {
                organizationId,
                branchId,
                productId: line.productId!,
                quantity: { gt: 0 },
              },
              orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
            });
            const checkedAt = new Date();
            const lots = physicalLots.filter(
              (lot) => stockAvailability(lot, checkedAt).sellableQuantity > 0,
            );
            const expiredQuantity = physicalLots.reduce(
              (sum, lot) =>
                sum + stockAvailability(lot, checkedAt).expiredQuantity,
              0,
            );
            const available = lots.reduce(
              (total, lot) => total + lot.quantity,
              0,
            );
            if (available < remaining && !offline)
              throw new BadRequestException(
                `${product.name}: stock vendible insuficiente. Disponibles: ${available}; solicitadas: ${remaining}.${expiredQuantity ? ` Hay ${expiredQuantity} unidades vencidas que no se pueden vender.` : " Actualizá el stock e intentá nuevamente."}`,
              );
            // Sin conexión se descuenta lo que hay; el resto queda como
            // faltante sin lote (nunca stock negativo) y con aviso.
            for (const { lot, quantity } of allocateSaleLots(
              lots,
              Math.min(available, remaining),
              line.packQuantity,
            )) {
              const lotDiscountMinor =
                quantity === remaining
                  ? lineDiscountMinor - assignedDiscountMinor
                  : (lineDiscountMinor * BigInt(quantity)) /
                    BigInt(line.quantity);
              assignedDiscountMinor += lotDiscountMinor;
              items.push({
                productId: line.productId!,
                lotId: lot.id,
                quantity,
                unitPriceMinor,
                discountMinor: lotDiscountMinor,
              });
              remaining -= quantity;
              if (!remaining) break;
            }
            if (remaining > 0 && offline) {
              items.push({
                productId: line.productId!,
                lotId: null,
                quantity: remaining,
                unitPriceMinor,
                discountMinor: lineDiscountMinor - assignedDiscountMinor,
              });
              offline.issues.push({
                kind: "STOCK_FALTANTE",
                detail: {
                  productId: product.id,
                  nombre: product.name,
                  vendidas: line.quantity,
                  faltantes: remaining,
                },
              });
            }
          }
          const total = items.reduce(
            (sum, item) =>
              sum +
              item.unitPriceMinor * BigInt(item.quantity) -
              item.discountMinor,
            0n,
          );
          const paid = input.payments.reduce(
            (sum, payment) => sum + BigInt(payment.amountMinor),
            0n,
          );
          if (paid < total)
            throw new BadRequestException(
              "Payments must cover the sale total.",
            );
          const accountAmount = input.payments
            .filter((payment) => payment.method === PaymentMethod.ACCOUNT)
            .reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n);
          // Sin conexión, la venta queda con la fecha en que se hizo.
          const completedAt = offline?.occurredAt ?? new Date();
          let dueDate: Date | null = null;
          if (accountAmount > 0n) {
            if (paid !== total)
              throw new BadRequestException(
                "Una venta a cuenta corriente no puede generar vuelto.",
              );
            const currentCustomer = await tx.customer.findFirst({
              where: {
                id: input.customerId,
                organizationId,
                ...(offline ? {} : { active: true }),
              },
            });
            if (!input.customerId || !currentCustomer)
              throw new BadRequestException(
                "Seleccioná un cliente con cuenta corriente habilitada.",
              );
            if (!currentCustomer.creditEnabled) {
              if (!offline)
                throw new BadRequestException(
                  "Seleccioná un cliente con cuenta corriente habilitada.",
                );
              offline.issues.push({
                kind: "LIMITE_CREDITO",
                detail: {
                  customerId: input.customerId,
                  motivo: "La cuenta corriente del cliente está deshabilitada.",
                  importeMinor: accountAmount.toString(),
                },
              });
            }
            dueDate = accountDueDate(
              completedAt,
              currentCustomer.accountTermDays,
            );
            const movements = await tx.customerAccountMovement.groupBy({
              by: ["type"],
              where: { customerId: input.customerId, organizationId },
              _sum: { amountMinor: true },
            });
            const balance = movements.reduce(
              (sum, movement) =>
                sum +
                (movement.type === "DEBIT" ? 1n : -1n) *
                  (movement._sum.amountMinor ?? 0n),
              0n,
            );
            if (
              currentCustomer.creditLimitMinor !== null &&
              balance + accountAmount > currentCustomer.creditLimitMinor
            ) {
              if (!offline)
                throw new BadRequestException(
                  "El importe a cuenta corriente supera el crédito disponible del cliente. Reducí ese importe o utilizá otro medio de pago.",
                );
              offline.issues.push({
                kind: "LIMITE_CREDITO",
                detail: {
                  customerId: input.customerId,
                  saldoMinor: balance.toString(),
                  limiteMinor: currentCustomer.creditLimitMinor.toString(),
                  importeMinor: accountAmount.toString(),
                },
              });
            }
          }
          const changeMinor = paid - total;
          const cashPaid = input.payments
            .filter((payment) => payment.method === PaymentMethod.CASH)
            .reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n);
          if (changeMinor > cashPaid)
            throw new BadRequestException(
              "El vuelto sólo puede salir de un pago en efectivo.",
            );
          const collectionSessions = [
            ...new Set(
              input.payments
                .map((payment) => payment.cashSessionId)
                .filter((id): id is string => Boolean(id)),
            ),
          ];
          if (collectionSessions.length > 1)
            throw new BadRequestException(
              "Los cobros de una venta deben usar la misma sesión de caja.",
            );
          let collectionSessionId = collectionSessions[0];
          // Sin conexión la venta ya se cobró: la regla de exigir caja abierta
          // no la frena; sin caja el cobro queda pendiente de asignar.
          if (!offline)
            await assertCollectionSession(
              tx,
              branchId,
              collectionSessionId,
              input.payments.every(
                (payment) => payment.method === PaymentMethod.ACCOUNT,
              ),
            );
          if (collectionSessionId) {
            await lockCashSession(tx, collectionSessionId);
            const session = await tx.cashSession.findFirst({
              where: {
                id: collectionSessionId,
                closedAt: null,
                // La caja tenía que estar abierta cuando se hizo la venta.
                ...(offline ? { openedAt: { lte: completedAt } } : {}),
              },
            });
            const register = session
              ? await tx.cashRegister.findFirst({
                  where: { id: session.cashRegisterId, branchId },
                })
              : null;
            if (!register) {
              if (!offline)
                throw new BadRequestException(
                  "La sesión de caja no está abierta en esta sucursal.",
                );
              // Se cerró mientras no había conexión: el cobro va a pendientes
              // de asignar, el circuito de siempre para cobros sin caja.
              offline.issues.push({
                kind: "CAJA_CERRADA",
                detail: { cashSessionId: collectionSessionId },
              });
              collectionSessionId = undefined;
            }
          }
          // Sin conexión, los registros llevan la fecha real de la venta.
          const occurred = offline ? { createdAt: completedAt } : {};
          const sale = await tx.sale.create({
            data: {
              // Sin conexión el id es el que generó la PC: el número del ticket
              // provisorio coincide con el de la venta registrada.
              ...(offline ? { id: input.clientOperationId } : {}),
              organizationId,
              branchId,
              customerId: input.customerId,
              clientOperationId: input.clientOperationId,
              status: "COMPLETED",
              documentType,
              totalMinor: total,
              completedAt,
              accountDueDate: dueDate,
            },
          });
          if (documentType === "INVOICE") {
            try {
              if (isProduction)
                await this.production!.enqueue(
                  tx,
                  actorId,
                  organizationId,
                  branchId,
                  sale.id,
                  input.customerId,
                  total,
                  items,
                  input.fiscalOptions,
                  Boolean(offline),
                );
              else
                await this.fiscal!.enqueue(
                  tx,
                  actorId,
                  organizationId,
                  branchId,
                  sale.id,
                  input.customerId,
                  total,
                  items,
                  input.fiscalOptions,
                );
            } catch (cause) {
              // Sólo errores de validación (antes de escribir): un error de
              // la base deja la transacción inutilizable y se propaga.
              if (
                !offline ||
                (cause instanceof Prisma.PrismaClientKnownRequestError &&
                  cause.code !== "P2025")
              )
                throw cause;
              documentType = "INTERNAL";
              await tx.sale.update({
                where: { id: sale.id },
                data: { documentType },
              });
              offline.issues.push({
                kind: "FACTURA_NO_PREPARADA",
                detail: {
                  motivo:
                    cause instanceof Error
                      ? cause.message.slice(0, 300)
                      : "No se pudo preparar la factura.",
                },
              });
            }
          }
          for (const item of items) {
            await tx.saleItem.create({ data: { saleId: sale.id, ...item } });
            // Conceptos manuales y faltantes sin conexión: no hay lote que
            // descontar.
            if (item.lotId === null) continue;
            await tx.productLot.update({
              where: { id: item.lotId },
              data: { quantity: { decrement: item.quantity } },
            });
            await tx.inventoryMovement.create({
              data: {
                organizationId,
                branchId,
                productId: item.productId!,
                lotId: item.lotId,
                type: "SALE",
                quantity: -item.quantity,
                actorId,
                referenceType: "SALE",
                referenceId: sale.id,
                ...(offline ? { occurredAt: completedAt } : {}),
              },
            });
          }
          await tx.salePayment.createMany({
            data: input.payments.map((payment) => ({
              saleId: sale.id,
              method: payment.method,
              amountMinor: BigInt(payment.amountMinor),
              cashSessionId:
                payment.method === PaymentMethod.ACCOUNT
                  ? undefined
                  : collectionSessionId,
              ...occurred,
            })),
          });
          if (accountAmount > 0n && input.customerId) {
            await tx.customerAccountMovement.create({
              data: {
                organizationId,
                branchId,
                customerId: input.customerId,
                saleId: sale.id,
                type: "DEBIT",
                amountMinor: accountAmount,
                note: `Sale ${sale.id}`,
                actorId,
                ...occurred,
              },
            });
          }
          if (!collectionSessionId)
            await recordPendingCollection(
              tx,
              {
                organizationId,
                branchId,
                actorId,
                sourceType: "SALE",
                sourceId: sale.id,
                ...(offline ? { collectedAt: completedAt } : {}),
              },
              input.payments,
              changeMinor,
            );
          if (changeMinor > 0n && collectionSessionId) {
            const cashSessionId = collectionSessionId;
            if (!cashSessionId)
              throw new BadRequestException(
                "Para dar vuelto hace falta una caja abierta.",
              );
            await tx.cashMovement.create({
              data: {
                cashSessionId,
                type: CashMovementType.OUT,
                amountMinor: changeMinor,
                reason: `Vuelto de venta ${sale.id}`,
                actorId,
                ...occurred,
              },
            });
          }
          if (offline) {
            await tx.offlineOperation.create({
              data: {
                id: input.clientOperationId!,
                organizationId,
                branchId,
                kind: "SALE",
                actorId,
                deviceId: offline.deviceId,
                occurredAt: completedAt,
                requestHash: offline.requestHash,
                entityId: sale.id,
              },
            });
            if (offline.issues.length)
              await tx.offlineSyncIssue.createMany({
                data: offline.issues.map((issue) => ({
                  organizationId,
                  branchId,
                  operationId: input.clientOperationId!,
                  saleId: sale.id,
                  kind: issue.kind,
                  detail: issue.detail,
                })),
              });
          }
          await this.audit.recordInTransaction(tx, {
            organizationId,
            branchId,
            actorId,
            entityType: "SALE",
            entityId: sale.id,
            action: "COMPLETED",
            after: {
              customerId: input.customerId ?? null,
              priceListId,
              totalMinor: total.toString(),
              priceOverrides,
              accountDueDate: dueDate?.toISOString().slice(0, 10) ?? null,
              items: items.map((item) => ({
                description: item.description ?? null,
                productId: item.productId,
                lotId: item.lotId,
                quantity: item.quantity,
                unitPriceMinor: item.unitPriceMinor.toString(),
                discountMinor: item.discountMinor.toString(),
              })),
              payments: input.payments.map((payment) => ({
                method: payment.method,
                amountMinor: payment.amountMinor,
                cashSessionId:
                  payment.method === PaymentMethod.ACCOUNT
                    ? null
                    : (collectionSessionId ?? null),
              })),
              changeMinor: changeMinor.toString(),
              ...(offline
                ? {
                    offline: {
                      occurredAt: completedAt.toISOString(),
                      deviceId: offline.deviceId,
                      issues: offline.issues.map((issue) => issue.kind),
                    },
                  }
                : {}),
            },
          });
          return this.serialize(
            await tx.sale.findUniqueOrThrow({
              where: { id: sale.id },
              include: { items: true, payments: true, fiscalTrial: true },
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      // Sin conexión no se envía acá: la cola fiscal las emite en orden, sin
      // demorar la sincronización.
      if (result.documentType === "INVOICE" && this.fiscal && !offline) {
        try {
          if (isProduction && this.production)
            return {
              ...result,
              fiscalDocument: await this.production.process(
                actorId,
                organizationId,
                branchId,
                result.id,
              ),
            };
          return {
            ...result,
            fiscalTrial: await this.fiscal.process(
              actorId,
              organizationId,
              branchId,
              result.id,
            ),
          };
        } catch {
          return result;
        } // The sale committed: never tell the POS to recreate it.
      }
      return result;
    } catch (cause) {
      // A repeated request can race with the original transaction. The unique
      // operation key is the final guard; returning the original sale keeps
      // confirmation idempotent instead of exposing a database error to POS.
      if (
        input.clientOperationId &&
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      ) {
        const existing = await this.prisma.sale.findFirst({
          where: { organizationId, clientOperationId: input.clientOperationId },
          include: { items: true, payments: true, fiscalTrial: true },
        });
        if (existing) {
          if (input.documentType === "INVOICE") {
            const productionDocument =
              await this.prisma.fiscalDocument.findFirst({
                where: {
                  sourceSaleId: existing.id,
                  organizationId,
                  kind: "INVOICE",
                },
              });
            if (Boolean(productionDocument) !== isProduction)
              throw new BadRequestException(
                "La operación ya pertenece a otro ambiente fiscal; consultá la venta original.",
              );
          }
          if (
            existing.branchId !== branchId ||
            existing.documentType !== (input.documentType ?? "INTERNAL")
          )
            throw new BadRequestException(
              "Esta operación ya pertenece a otra sucursal o tipo de comprobante.",
            );
          return this.serialize(existing);
        }
      }
      throw cause;
    }
  }

  async cancel(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
    reason: string,
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId}::uuid AND "organizationId" = ${organizationId}::uuid AND "branchId" = ${branchId}::uuid FOR UPDATE`;
        const sale = await tx.sale.findFirst({
          where: { id: saleId, organizationId, branchId, status: "COMPLETED" },
          include: { items: true, payments: true, customerReturns: true },
        });
        if (!sale)
          throw new NotFoundException("Completed sale is unavailable.");
        if (sale.documentType === "INVOICE") {
          const productionDocument = await tx.fiscalDocument.findFirst({
            where: { sourceSaleId: saleId, organizationId, kind: "INVOICE" },
          });
          if (
            productionDocument &&
            !["QUEUED", "REJECTED"].includes(productionDocument.status)
          )
            throw new BadRequestException(
              "La factura productiva requiere nota de crédito; no se anula como ticket.",
            );
          const invoice = await tx.fiscalTrial.findUnique({
            where: { sourceSaleId: saleId },
          });
          if (invoice && !["QUEUED", "REJECTED"].includes(invoice.status))
            throw new BadRequestException(
              "La factura está autorizada o pendiente en ARCA. No se permite anularla como ticket interno; requiere el circuito de nota de crédito.",
            );
        }
        if (sale.customerReturns.length)
          throw new BadRequestException(
            "A sale with customer returns cannot be cancelled.",
          );
        const cashSessionIds = sale.payments
          .map((payment) => payment.cashSessionId)
          .filter((id): id is string => Boolean(id));
        const pendingCollection = await tx.cashPendingCollection.findUnique({
          where: {
            organizationId_sourceType_sourceId: {
              organizationId,
              sourceType: "SALE",
              sourceId: sale.id,
            },
          },
        });
        if (pendingCollection?.assignedSessionId)
          cashSessionIds.push(pendingCollection.assignedSessionId);
        if (cashSessionIds.length) {
          for (const id of [...new Set(cashSessionIds)].sort())
            await lockCashSession(tx, id);
          const closedSession = await tx.cashSession.findFirst({
            where: { id: { in: cashSessionIds }, closedAt: { not: null } },
          });
          if (closedSession)
            throw new BadRequestException(
              "No se puede anular una venta cuya sesión de caja ya está cerrada.",
            );
        }
        for (const item of sale.items) {
          if (!item.productId && item.description) continue;
          // Faltante de una venta sin conexión: nunca se descontó de un lote,
          // así que anular no repone nada.
          if (item.productId && !item.lotId) continue;
          if (!item.lotId || !item.productId)
            throw new BadRequestException(
              "The original lot is unavailable for cancellation.",
            );
          await reopenForHistoricStock(
            tx,
            actorId,
            organizationId,
            branchId,
            item.productId,
            sale.id,
          );
          await tx.productLot.update({
            where: { id: item.lotId },
            data: { quantity: { increment: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              organizationId,
              branchId,
              productId: item.productId,
              lotId: item.lotId,
              type: "SALE_CANCELLATION",
              quantity: item.quantity,
              actorId,
              referenceType: "SALE",
              referenceId: sale.id,
            },
          });
        }
        const debits = await tx.customerAccountMovement.aggregate({
          where: { organizationId, saleId: sale.id, type: "DEBIT" },
          _sum: { amountMinor: true },
        });
        const priorCredits = await tx.customerAccountMovement.aggregate({
          where: { organizationId, saleId: sale.id, type: "CREDIT" },
          _sum: { amountMinor: true },
        });
        const financed =
          (debits._sum.amountMinor ?? 0n) -
          (priorCredits._sum.amountMinor ?? 0n);
        if (financed > 0n && sale.customerId)
          await tx.customerAccountMovement.create({
            data: {
              organizationId,
              branchId,
              customerId: sale.customerId,
              saleId: sale.id,
              type: "CREDIT",
              amountMinor: financed,
              actorId,
              note: `Anulación de venta: ${reason.trim()}`,
            },
          });
        if (pendingCollection && !pendingCollection.voidedAt) {
          if (
            pendingCollection.assignedSessionId &&
            pendingCollection.cashMinor > 0n
          )
            await tx.cashMovement.create({
              data: {
                cashSessionId: pendingCollection.assignedSessionId,
                type: "OUT",
                amountMinor: pendingCollection.cashMinor,
                actorId,
                reason: `Anulación de cobro asignado · Venta ${sale.id}: ${reason.trim()}`,
              },
            });
          await tx.cashPendingCollection.update({
            where: { id: pendingCollection.id },
            data: { voidedAt: new Date() },
          });
        }
        // El pago deja de contar al anular, así que el vuelto entregado también
        // se compensa. El texto anterior sigue en ventas de sesiones aún abiertas.
        const change = cashSessionIds.length
          ? await tx.cashMovement.findFirst({
              where: {
                cashSessionId: { in: cashSessionIds },
                type: CashMovementType.OUT,
                reason: {
                  in: [
                    `Vuelto de venta ${sale.id}`,
                    `Change for sale ${sale.id}`,
                  ],
                },
              },
            })
          : null;
        if (change)
          await tx.cashMovement.create({
            data: {
              cashSessionId: change.cashSessionId,
              type: CashMovementType.IN,
              amountMinor: change.amountMinor,
              actorId,
              reason: `Anulación de vuelto · Venta ${sale.id}: ${reason.trim()}`,
            },
          });
        const cancelled = await tx.sale.update({
          where: { id: sale.id },
          data: { status: "CANCELLED" },
        });
        // Una venta sin conexión anulada ya no tiene nada que revisar: sus
        // avisos abiertos se cierran solos (SISTEMA-64).
        const closedIssues = await tx.offlineSyncIssue.updateMany({
          where: { organizationId, saleId: sale.id, status: "OPEN" },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedById: actorId,
            resolutionNote: "Venta anulada",
          },
        });
        await this.audit.recordInTransaction(tx, {
          organizationId,
          branchId,
          actorId,
          entityType: "SALE",
          entityId: sale.id,
          action: "CANCELLED",
          before: {
            status: "COMPLETED",
            totalMinor: sale.totalMinor.toString(),
          },
          after: {
            status: "CANCELLED",
            reason: reason.trim(),
            ...(change
              ? { changeReversedMinor: change.amountMinor.toString() }
              : {}),
            ...(closedIssues.count
              ? { offlineIssuesResolved: closedIssues.count }
              : {}),
          },
        });
        return { id: cancelled.id, status: cancelled.status };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async customerReturn(
    actorId: string,
    organizationId: string,
    branchId: string,
    saleId: string,
    input: {
      reason: string;
      items: { saleItemId: string; quantity: number }[];
    },
  ) {
    await this.assert(actorId, organizationId, "SALE_MANAGE");
    if (!input.items.length)
      throw new BadRequestException(
        "A customer return needs at least one item.",
      );
    if (
      new Set(input.items.map((item) => item.saleItemId)).size !==
      input.items.length
    )
      throw new BadRequestException(
        "A sale item can only appear once per return.",
      );
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, organizationId, branchId, status: "COMPLETED" },
        include: { items: true },
      });
      if (!sale) throw new NotFoundException("Completed sale is unavailable.");
      if (sale.documentType === "INVOICE")
        throw new BadRequestException(
          "La devolución de una venta facturada requiere una nota de crédito. Este circuito todavía no está habilitado.",
        );
      const requested = new Map(
        input.items.map((item) => [item.saleItemId, item.quantity]),
      );
      const saleItems = sale.items.filter((item) => requested.has(item.id));
      if (saleItems.some((item) => !item.productId))
        throw new BadRequestException(
          "Los conceptos no tienen devolución física. Para revertir el cobro utilizá la anulación de la venta.",
        );
      if (saleItems.length !== input.items.length)
        throw new BadRequestException(
          "One or more return items do not belong to this sale.",
        );
      const priorReturns = await tx.customerReturnItem.groupBy({
        by: ["saleItemId"],
        where: { saleItemId: { in: saleItems.map((item) => item.id) } },
        _sum: { quantity: true },
      });
      const alreadyReturned = new Map(
        priorReturns.map((item) => [item.saleItemId, item._sum.quantity ?? 0]),
      );
      for (const item of saleItems) {
        const quantity = requested.get(item.id)!;
        if (quantity + (alreadyReturned.get(item.id) ?? 0) > item.quantity)
          throw new BadRequestException(
            "Returned quantity exceeds the original sale.",
          );
      }
      const customerReturn = await tx.customerReturn.create({
        data: {
          organizationId,
          branchId,
          saleId,
          actorId,
          reason: input.reason.trim(),
          items: { create: input.items.map((item) => ({ ...item })) },
        },
        include: { items: true },
      });
      await this.audit.recordInTransaction(tx, {
        organizationId,
        branchId,
        actorId,
        entityType: "CUSTOMER_RETURN",
        entityId: customerReturn.id,
        action: "RECEIVED_NOT_RESTOCKED",
        after: {
          saleId,
          reason: input.reason.trim(),
          items: input.items,
        },
      });
      return customerReturn;
    });
  }

  private serialize<
    T extends {
      totalMinor: bigint;
      items: { unitPriceMinor: bigint; discountMinor: bigint }[];
      payments: { amountMinor: bigint }[];
    },
  >(sale: T) {
    return {
      ...sale,
      totalMinor: sale.totalMinor.toString(),
      items: sale.items.map((item) => ({
        ...item,
        unitPriceMinor: item.unitPriceMinor.toString(),
        discountMinor: item.discountMinor.toString(),
      })),
      payments: sale.payments.map((payment) => ({
        ...payment,
        amountMinor: payment.amountMinor.toString(),
      })),
    };
  }
  private async ensureBranch(organizationId: string, branchId: string) {
    if (
      !(await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId, active: true },
      }))
    )
      throw new NotFoundException("Branch is unavailable.");
  }
  private async assert(actorId: string, organizationId: string, code: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !membership?.active ||
      !membership.roles.some(({ role }) =>
        role.permissions.some(({ permission }) => permission.code === code),
      )
    )
      throw new ForbiddenException(
        "No tenés permiso para esta operación. Pedíselo al dueño de la farmacia.",
      );
  }
}
