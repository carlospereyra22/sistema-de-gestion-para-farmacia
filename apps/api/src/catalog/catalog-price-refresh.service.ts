import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AlfaBetaService } from "./alfabeta.service";
import { fractionalPrice } from "./fractional-price";
import {
  type MedicineReference,
  MedicineReferenceService,
} from "./medicine-reference.service";

const SCHEDULED_UTC_HOURS = [12, 20] as const;

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

export function nextArgentinaPriceRefresh(now = new Date()): Date {
  const current = now.getTime();
  const utcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  for (const hour of SCHEDULED_UTC_HOURS) {
    const candidate = new Date(utcDay + hour * 3600000);
    if (candidate.getTime() > current) return candidate;
  }
  return new Date(utcDay + 24 * 3600000 + SCHEDULED_UTC_HOURS[0] * 3600000);
}

@Injectable()
export class CatalogPriceRefreshService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CatalogPriceRefreshService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: MedicineReferenceService,
    private readonly audit: AuditService,
    private readonly alfabeta: AlfaBetaService,
  ) {}

  onModuleInit() {
    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextRun() {
    const next = nextArgentinaPriceRefresh();
    const delay = Math.max(next.getTime() - Date.now(), 1000);
    this.timer = setTimeout(() => {
      void this.refreshAll()
        .catch((cause: unknown) =>
          this.logger.error(
            "No se pudo completar la actualización programada de referencias.",
            cause instanceof Error ? cause.stack : undefined,
          ),
        )
        .finally(() => this.scheduleNextRun());
    }, delay);
    this.logger.log(
      `Próxima actualización de referencias: ${next.toISOString()} (09:00 o 17:00 de Argentina).`,
    );
  }

  async refreshAll(organizationId?: string) {
    if (this.running) return { checked: 0, updated: 0, skipped: true };
    this.running = true;
    try {
      const products = await this.prisma.product.findMany({
        where: {
          active: true,
          ...(organizationId ? { organizationId } : {}),
          externalReferenceSource: {
            in: ["official", "preciosderemedios", "alfabeta"],
          },
          externalReferenceName: { not: null },
        },
        select: {
          id: true,
          organizationId: true,
          externalReferenceSource: true,
          externalReferenceName: true,
          externalReferencePresentation: true,
          externalReferenceBarcode: true,
          externalReferencePriceMinor: true,
        },
      });
      let updated = 0;
      for (const product of products) {
        if (
          !product.externalReferenceName ||
          !this.isReferenceSource(product.externalReferenceSource)
        )
          continue;
        try {
          const references =
            product.externalReferenceSource === "alfabeta"
              ? await this.alfaBetaReferences(product.externalReferenceName)
              : await this.references.search(
                  product.externalReferenceName,
                  product.externalReferenceSource,
                );
          const reference = this.findReference(product, references);
          const checkedAt = new Date();
          if (
            !reference ||
            reference.priceMinor === null ||
            !Number.isSafeInteger(reference.priceMinor) ||
            reference.priceMinor <= 0
          ) {
            this.logger.warn(
              `Sin precio válido para la presentación vinculada del producto ${product.id}; se conserva su precio.`,
            );
            continue;
          }
          const amount = BigInt(reference.priceMinor);
          const changed = await this.prisma.$transaction(async (tx) => {
            // Serialize updates and revalidate the binding after the external request.
            await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id}::uuid FOR UPDATE`;
            const current = await tx.product.findUnique({
              where: { id: product.id },
            });
            if (
              !current ||
              !current.active ||
              current.organizationId !== product.organizationId ||
              current.externalReferenceSource !==
                product.externalReferenceSource ||
              current.externalReferenceName !== product.externalReferenceName ||
              current.externalReferencePresentation !==
                product.externalReferencePresentation ||
              current.externalReferenceBarcode !==
                product.externalReferenceBarcode
            )
              return false;
            const referenceChanged =
              current.externalReferencePriceMinor !== amount;
            await tx.product.update({
              where: { id: product.id },
              data: {
                externalReferencePriceMinor: amount,
                externalReferenceUpdatedAt: this.externalDate(
                  reference.updatedAt,
                ),
                externalReferenceCheckedAt: checkedAt,
              },
            });
            let salePriceChanged = false;
            // Only an explicitly configured divisor permits automatic fractional pricing.
            if (current.saleUnit === "BOX" || current.priceDivisor != null) {
              const saleAmount =
                current.priceDivisor != null
                  ? fractionalPrice(
                      amount,
                      current.priceDivisor,
                      current.priceMarkupBps,
                    )
                  : amount;
              const priceList = await tx.priceList.upsert({
                where: {
                  organizationId_name: {
                    organizationId: product.organizationId,
                    name: "Precio general",
                  },
                },
                update: {},
                create: {
                  organizationId: product.organizationId,
                  name: "Precio general",
                },
              });
              const key = {
                productId_priceListId: {
                  productId: product.id,
                  priceListId: priceList.id,
                },
              };
              const previous = await tx.productPrice.findUnique({ where: key });
              salePriceChanged = previous?.amountMinor !== saleAmount;
              if (salePriceChanged) {
                await tx.productPrice.upsert({
                  where: key,
                  update: { amountMinor: saleAmount },
                  create: {
                    productId: product.id,
                    priceListId: priceList.id,
                    amountMinor: saleAmount,
                  },
                });
                await this.audit.recordInTransaction(tx, {
                  organizationId: product.organizationId,
                  entityType: "PRODUCT",
                  entityId: product.id,
                  action: "PRODUCT_PRICE_SYNCED",
                  before: {
                    amountMinor: previous?.amountMinor.toString() ?? null,
                  },
                  after: {
                    amountMinor: saleAmount.toString(),
                    divisor: current.priceDivisor ?? null,
                    markupBps: current.priceMarkupBps ?? 0,
                    referencePriceMinor: amount.toString(),
                    priceListId: priceList.id,
                    source: reference.source,
                    presentation: reference.presentation,
                  },
                });
              }
            }
            if (referenceChanged) {
              await this.audit.recordInTransaction(tx, {
                organizationId: product.organizationId,
                entityType: "PRODUCT",
                entityId: product.id,
                action: "EXTERNAL_REFERENCE_PRICE_UPDATED",
                before: {
                  externalReferencePriceMinor:
                    current.externalReferencePriceMinor?.toString() ?? null,
                },
                after: {
                  externalReferencePriceMinor: reference.priceMinor,
                  source: reference.source,
                  checkedAt: checkedAt.toISOString(),
                },
              });
            }
            return referenceChanged || salePriceChanged;
          });
          if (changed) updated += 1;
        } catch (cause) {
          this.logger.warn(
            `No se pudo actualizar la referencia del producto ${product.id}: ${
              cause instanceof Error ? cause.message : "error desconocido"
            }`,
          );
        }
      }
      const result = { checked: products.length, updated, skipped: false };
      this.logger.log(
        `Actualización programada finalizada: ${products.length} referencias revisadas, ${updated} precios modificados.`,
      );
      return result;
    } finally {
      this.running = false;
    }
  }

  private findReference(
    product: {
      externalReferenceName: string | null;
      externalReferencePresentation: string | null;
      externalReferenceBarcode: string | null;
    },
    references: MedicineReference[],
  ) {
    const sameBarcode = product.externalReferenceBarcode
      ? references.filter(
          (reference) => reference.barcode === product.externalReferenceBarcode,
        )
      : [];
    if (sameBarcode.length === 1) return sameBarcode[0];
    if (
      sameBarcode.length > 1 ||
      !product.externalReferencePresentation?.trim()
    )
      return undefined;
    const sameNameAndPresentation = references.filter(
      (reference) =>
        normalized(reference.name) ===
          normalized(product.externalReferenceName ?? "") &&
        normalized(reference.presentation) ===
          normalized(product.externalReferencePresentation ?? ""),
    );
    return sameNameAndPresentation.length === 1
      ? sameNameAndPresentation[0]
      : undefined;
  }

  private async alfaBetaReferences(name: string) {
    const matches = (await this.alfabeta.search(name)).filter(
      (item) => normalized(item.name) === normalized(name),
    );
    if (matches.length !== 1) return [];
    const match = matches[0]!;
    const detail = await this.alfabeta.detail(match.id);
    if (normalized(detail.name) !== normalized(name)) return [];
    return detail.presentations.map((presentation) => ({
      ...presentation,
      source: "alfabeta" as const,
      name: detail.name,
      laboratory: match.laboratory,
      barcode: "",
      activeIngredient: "",
      troquel: "",
      pamiPriceMinor: null,
      saleType: "",
    }));
  }

  private externalDate(value: string | null) {
    if (!value) return null;
    const localDate = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(value);
    if (localDate) {
      const year =
        Number(localDate[3]) + (localDate[3]!.length === 2 ? 2000 : 0);
      const date = new Date(
        Date.UTC(year, Number(localDate[2]) - 1, Number(localDate[1])),
      );
      return date.getUTCFullYear() === year &&
        date.getUTCMonth() === Number(localDate[2]) - 1 &&
        date.getUTCDate() === Number(localDate[1])
        ? date
        : null;
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  private isReferenceSource(
    value: string | null,
  ): value is "official" | "preciosderemedios" | "alfabeta" {
    return (
      value === "official" ||
      value === "preciosderemedios" ||
      value === "alfabeta"
    );
  }
}
