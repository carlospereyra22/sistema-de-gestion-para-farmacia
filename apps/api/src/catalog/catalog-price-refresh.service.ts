import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AlfaBetaService } from "./alfabeta.service";
import { fractionalPrice } from "./fractional-price";
import { MedicineCatalogService } from "./medicine-catalog.service";
import {
  isPartialSnapshot,
  officialCandidates,
  officialIndex,
  referenceFromSnapshot,
  replaceLookupSnapshot,
  replaceOfficialSnapshot,
  sameGtin,
  snapshotKey,
  type OfficialIndex,
} from "./medicine-reference-snapshot";
import {
  type MedicineReference,
  MedicineReferenceService,
} from "./medicine-reference.service";

const SCHEDULED_UTC_HOURS = [12, 20] as const;
// Una corrida global que quedó RUNNING más de esto (proceso caído) se cierra.
const STALE_RUN_MS = 2 * 60 * 60 * 1000;
// Búsquedas por nombre simultáneas en fuentes que no se descargan completas.
const LOOKUP_CONCURRENCY = 2;
const CHECKED_AT_CHUNK = 500;
export const PRICE_REFRESH_PAUSED_KEY = "priceRefresh.paused";

type ReferenceSource = "official" | "preciosderemedios" | "alfabeta";
export type PriceRefreshTrigger = "SCHEDULED" | "COMMAND" | "ORGANIZATION";

type LinkedProduct = {
  id: string;
  organizationId: string;
  externalReferenceSource: string | null;
  externalReferenceName: string | null;
  externalReferencePresentation: string | null;
  externalReferenceBarcode: string | null;
  externalReferencePriceMinor: bigint | null;
  saleUnit: string;
  priceDivisor: number | null;
  priceMarkupBps: number;
  prices: { amountMinor: bigint }[];
};

function normalized(value: string): string {
  return snapshotKey(value);
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

// Precio de venta que corresponde a una referencia, o null si la unidad de
// venta no admite precio automático (blíster/unidad sin divisor configurado).
export function expectedSalePrice(
  amount: bigint,
  product: Pick<LinkedProduct, "saleUnit" | "priceDivisor" | "priceMarkupBps">,
): bigint | null {
  if (product.priceDivisor != null)
    return fractionalPrice(
      amount,
      product.priceDivisor,
      product.priceMarkupBps,
    );
  return product.saleUnit === "BOX" ? amount : null;
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
    private readonly catalog: MedicineCatalogService,
  ) {}

  onModuleInit() {
    // El comando de servidor arranca la app sin el temporizador.
    if (process.env.PRICE_REFRESH_SCHEDULER === "off") return;
    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextRun() {
    const next = nextArgentinaPriceRefresh();
    const delay = Math.max(next.getTime() - Date.now(), 1000);
    this.timer = setTimeout(() => {
      void this.refreshAll(undefined, "SCHEDULED")
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

  // Global (sin organización): descarga el padrón una vez, lo guarda en la
  // copia local y actualiza todas las farmacias. De una farmacia: aplica la
  // copia local sin descargar el padrón.
  async refreshAll(
    organizationId?: string,
    trigger: PriceRefreshTrigger = organizationId ? "ORGANIZATION" : "COMMAND",
  ) {
    // Sólo la corrida global es exclusiva; la de una farmacia puede correr a la
    // par porque cada producto se bloquea con FOR UPDATE.
    const global = !organizationId;
    if (global && this.running)
      return { checked: 0, updated: 0, skipped: true, runId: null };
    if (global) this.running = true;
    const started = Date.now();
    try {
      const run = await this.startRun(organizationId, trigger);
      if (!run) return { checked: 0, updated: 0, skipped: true, runId: null };
      try {
        const result = await this.execute(run.id, organizationId);
        await this.prisma.priceRefreshRun.update({
          where: { id: run.id },
          data: { ...result.run, finishedAt: new Date() },
        });
        this.logger.log(
          `Actualización ${run.id} (${trigger}) finalizada en ${Date.now() - started} ms: ${result.checked} referencias revisadas, ${result.updated} precios modificados, estado ${result.run.status}.`,
        );
        return {
          checked: result.checked,
          updated: result.updated,
          skipped: false,
          runId: run.id,
        };
      } catch (cause) {
        await this.prisma.priceRefreshRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            message:
              cause instanceof Error ? cause.message : "Error desconocido",
          },
        });
        throw cause;
      }
    } finally {
      if (global) this.running = false;
    }
  }

  private async startRun(
    organizationId: string | undefined,
    trigger: PriceRefreshTrigger,
  ) {
    if (!organizationId)
      await this.prisma.priceRefreshRun.updateMany({
        where: {
          status: "RUNNING",
          organizationId: null,
          startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) },
        },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          message: "La corrida quedó interrumpida.",
        },
      });
    try {
      return await this.prisma.priceRefreshRun.create({
        data: { organizationId, trigger, status: "RUNNING" },
        select: { id: true },
      });
    } catch (cause) {
      // Otra instancia de la API ya tiene una corrida global en curso.
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      ) {
        this.logger.warn("Otra corrida global está en curso; se omite.");
        return null;
      }
      throw cause;
    }
  }

  private async execute(runId: string, organizationId?: string) {
    let snapshotRows: number | undefined;
    let message: string | undefined;
    if (!organizationId) {
      const download = await this.downloadOfficial(runId);
      // Una fuente que falla no frena a las demás: la base conserva sus precios.
      const catalogMessage = await this.refreshCatalog(download.payload);
      if (download.status === "ABORTED")
        return {
          checked: 0,
          updated: 0,
          run: {
            status: "ABORTED",
            snapshotRows: download.rows,
            message: [download.message, catalogMessage].join(" "),
          },
        };
      snapshotRows = download.rows;
      message = [download.message, catalogMessage].filter(Boolean).join(" ");
    }
    if (await this.isPaused())
      return {
        checked: 0,
        updated: 0,
        run: {
          status: "PAUSED",
          snapshotRows,
          message: "Aplicación automática de precios en pausa.",
        },
      };
    const index = officialIndex(
      (
        await this.prisma.medicineReferenceSnapshot.findMany({
          where: { source: "official" },
        })
      ).map(referenceFromSnapshot),
    );
    const catalogIndex = officialIndex(await this.catalog.references());
    const products = await this.linkedProducts(organizationId);
    const lookups = new Map<string, Promise<MedicineReference[]>>();
    const pending: (() => Promise<void>)[] = [];
    const unchanged: string[] = [];
    let updated = 0;
    let failed = 0;
    const handle = async (product: LinkedProduct) => {
      try {
        const references = await this.candidates(
          product,
          index,
          catalogIndex,
          lookups,
          runId,
          Boolean(organizationId),
        );
        const outcome = await this.applyProduct(product, references, runId);
        if (outcome === "updated") updated += 1;
        else if (outcome === "unchanged") unchanged.push(product.id);
      } catch (cause) {
        failed += 1;
        this.logger.warn(
          `No se pudo actualizar la referencia del producto ${product.id}: ${
            cause instanceof Error ? cause.message : "error desconocido"
          }`,
        );
      }
    };
    for (const product of products) pending.push(() => handle(product));
    // El padrón está en memoria; sólo las otras fuentes salen a internet, de a
    // pocas búsquedas simultáneas.
    await runLimited(pending, LOOKUP_CONCURRENCY);
    await this.markChecked(unchanged);
    return {
      checked: products.length,
      updated,
      run: {
        status: "SUCCEEDED",
        snapshotRows,
        checked: products.length,
        updated,
        failed,
        message,
      },
    };
  }

  // Descarga el padrón completo y reemplaza la copia local. Si la fuente falla
  // se conserva la copia anterior; si responde parcial, la corrida se aborta.
  private async downloadOfficial(runId: string): Promise<{
    status: "SUCCEEDED" | "ABORTED" | "KEPT";
    rows?: number;
    message?: string;
    payload?: unknown[];
  }> {
    let references: MedicineReference[];
    let payload: unknown[];
    try {
      ({ references, payload } = await this.references.downloadOfficialData());
    } catch (cause) {
      const message =
        `No se pudo descargar el padrón; se usa la copia anterior. ${
          cause instanceof Error ? cause.message : ""
        }`.trim();
      this.logger.warn(message);
      return { status: "KEPT", message };
    }
    const previous = await this.prisma.medicineReferenceSnapshot.count({
      where: { source: "official" },
    });
    if (isPartialSnapshot(references.length, previous)) {
      const message = `El padrón devolvió ${references.length} filas (antes ${previous}); se aborta para no aplicar una respuesta parcial.`;
      this.logger.warn(message);
      return { status: "ABORTED", rows: references.length, message };
    }
    await this.prisma.$transaction(
      (tx) => replaceOfficialSnapshot(tx, runId, references),
      { timeout: 120000 },
    );
    return { status: "SUCCEEDED", rows: references.length, payload };
  }

  // Actualiza la base de medicamentos. `payload` solo llega si el padrón se
  // descargó completo; Precios de Remedios y AlfaBeta se leen siempre.
  private async refreshCatalog(payload?: unknown[]): Promise<string> {
    const parts: string[] = [];
    try {
      if (payload) {
        const official = await this.catalog.refreshOfficial(payload);
        parts.push(`padrón ${official.updated}, bajas ${official.delisted}`);
      }
      const { remedies, alfabeta } = await this.catalog.refreshLinkedSources();
      for (const [label, result] of [
        ["Remedios", remedies],
        ["AlfaBeta", alfabeta],
      ] as const)
        parts.push(
          `${label} ${result.updated} cambiados, ${result.missing} sin fila, ${result.review} a revisar, ${result.failedLinks} links caídos${result.stopped ? " (fuente caída, se dejó de consultar)" : ""}`,
        );
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : "error desconocido";
      this.logger.warn(`No se pudo actualizar la base: ${detail}`);
      parts.push(`error: ${detail}`);
    }
    return `Base de medicamentos: ${parts.join("; ")}.`;
  }

  async isPaused() {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: PRICE_REFRESH_PAUSED_KEY },
    });
    return setting?.value === true;
  }

  async setPaused(paused: boolean) {
    await this.prisma.platformSetting.upsert({
      where: { key: PRICE_REFRESH_PAUSED_KEY },
      update: { value: paused },
      create: { key: PRICE_REFRESH_PAUSED_KEY, value: paused },
    });
  }

  private linkedProducts(organizationId?: string): Promise<LinkedProduct[]> {
    return this.prisma.product.findMany({
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
        saleUnit: true,
        priceDivisor: true,
        priceMarkupBps: true,
        prices: {
          where: { priceList: { is: { name: "Precio general" } } },
          select: { amountMinor: true },
          take: 1,
        },
      },
    });
  }

  private async candidates(
    product: LinkedProduct,
    index: OfficialIndex,
    catalogIndex: OfficialIndex,
    lookups: Map<string, Promise<MedicineReference[]>>,
    runId: string,
    preferSnapshot: boolean,
  ): Promise<MedicineReference[]> {
    const source = product.externalReferenceSource;
    const name = product.externalReferenceName;
    if (!name || !isReferenceSource(source)) return [];
    // La base propia manda. Lo que no está ahí sigue con su fuente de siempre.
    const fromCatalog = officialCandidates(
      catalogIndex,
      name,
      product.externalReferenceBarcode,
    );
    if (this.findReference(product, fromCatalog)) return fromCatalog;
    if (source === "official")
      return officialCandidates(index, name, product.externalReferenceBarcode);
    // Un mismo medicamento se busca una sola vez en toda la corrida, aunque lo
    // tengan muchas farmacias.
    const key = `${source}|${normalized(name)}`;
    let lookup = lookups.get(key);
    if (!lookup) {
      lookup = this.lookup(source, name, runId, preferSnapshot);
      lookups.set(key, lookup);
    }
    return lookup;
  }

  // Precios de Remedios y AlfaBeta sólo permiten buscar por nombre. La corrida
  // global consulta la fuente y guarda el resultado; la de una farmacia usa lo
  // guardado y sólo sale a internet si ese medicamento nunca se consultó.
  private async lookup(
    source: "preciosderemedios" | "alfabeta",
    name: string,
    runId: string,
    preferSnapshot: boolean,
  ): Promise<MedicineReference[]> {
    if (preferSnapshot) {
      const saved = await this.prisma.medicineReferenceSnapshot.findMany({
        where: { source, lookupKey: normalized(name) },
      });
      if (saved.length) return saved.map(referenceFromSnapshot);
    }
    const references =
      source === "alfabeta"
        ? await this.alfaBetaReferences(name)
        : await this.references.search(name, source);
    await this.prisma.$transaction((tx) =>
      replaceLookupSnapshot(tx, runId, source, name, references),
    );
    return references;
  }

  private async applyProduct(
    product: LinkedProduct,
    references: MedicineReference[],
    runId: string,
  ): Promise<"updated" | "unchanged" | "skipped"> {
    const reference = this.findReference(product, references);
    if (
      !reference ||
      reference.priceMinor === null ||
      !Number.isSafeInteger(reference.priceMinor) ||
      reference.priceMinor <= 0
    ) {
      this.logger.warn(
        `Sin precio válido para la presentación vinculada del producto ${product.id}; se conserva su precio.`,
      );
      return "skipped";
    }
    const amount = BigInt(reference.priceMinor);
    const sale = expectedSalePrice(amount, product);
    // Sin cambios de referencia ni de precio de venta: no abre transacción.
    if (
      product.externalReferencePriceMinor === amount &&
      (sale === null || product.prices[0]?.amountMinor === sale)
    )
      return "unchanged";
    const checkedAt = new Date();
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
        current.externalReferenceSource !== product.externalReferenceSource ||
        current.externalReferenceName !== product.externalReferenceName ||
        current.externalReferencePresentation !==
          product.externalReferencePresentation ||
        current.externalReferenceBarcode !== product.externalReferenceBarcode
      )
        return false;
      const referenceChanged = current.externalReferencePriceMinor !== amount;
      await tx.product.update({
        where: { id: product.id },
        data: {
          externalReferencePriceMinor: amount,
          externalReferenceUpdatedAt: this.externalDate(reference.updatedAt),
          externalReferenceCheckedAt: checkedAt,
        },
      });
      let salePriceChanged = false;
      let priceListId: string | null = null;
      let previousSale: bigint | null = null;
      const saleAmount = expectedSalePrice(amount, current);
      // Only an explicitly configured divisor permits automatic fractional pricing.
      if (saleAmount !== null) {
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
        priceListId = priceList.id;
        const key = {
          productId_priceListId: {
            productId: product.id,
            priceListId: priceList.id,
          },
        };
        const previous = await tx.productPrice.findUnique({ where: key });
        previousSale = previous?.amountMinor ?? null;
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
              runId,
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
            runId,
          },
        });
      }
      if (referenceChanged || salePriceChanged)
        await tx.priceRefreshChange.create({
          data: {
            runId,
            organizationId: product.organizationId,
            productId: product.id,
            priceListId: salePriceChanged ? priceListId : null,
            beforeAmountMinor: salePriceChanged ? previousSale : null,
            afterAmountMinor: salePriceChanged ? saleAmount : null,
            beforeReferenceMinor: current.externalReferencePriceMinor,
            afterReferenceMinor: amount,
          },
        });
      return referenceChanged || salePriceChanged;
    });
    return changed ? "updated" : "skipped";
  }

  // Los productos sin cambios sólo registran la fecha de la revisión.
  private async markChecked(productIds: string[]) {
    const checkedAt = new Date();
    for (let start = 0; start < productIds.length; start += CHECKED_AT_CHUNK)
      await this.prisma.product.updateMany({
        where: {
          id: { in: productIds.slice(start, start + CHECKED_AT_CHUNK) },
        },
        data: { externalReferenceCheckedAt: checkedAt },
      });
  }

  // Deshace los precios que cambió una corrida, salvo los que se modificaron
  // después (a mano u otra corrida): esos se informan y no se tocan.
  async revertRun(actorId: string | null, runId: string) {
    const run = await this.prisma.priceRefreshRun.findUnique({
      where: { id: runId },
      include: { changes: true },
    });
    if (!run) throw new NotFoundException("La corrida no existe.");
    let reverted = 0;
    const kept: string[] = [];
    for (const change of run.changes) {
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${change.productId}::uuid FOR UPDATE`;
        const product = await tx.product.findUnique({
          where: { id: change.productId },
          select: { externalReferencePriceMinor: true },
        });
        const price = change.priceListId
          ? await tx.productPrice.findUnique({
              where: {
                productId_priceListId: {
                  productId: change.productId,
                  priceListId: change.priceListId,
                },
              },
            })
          : null;
        const saleIntact =
          !change.priceListId ||
          change.beforeAmountMinor === null ||
          price?.amountMinor === change.afterAmountMinor;
        const referenceIntact =
          product?.externalReferencePriceMinor === change.afterReferenceMinor;
        if (!product || !saleIntact || !referenceIntact) return false;
        await tx.product.update({
          where: { id: change.productId },
          data: { externalReferencePriceMinor: change.beforeReferenceMinor },
        });
        if (change.priceListId && change.beforeAmountMinor !== null)
          await tx.productPrice.update({
            where: {
              productId_priceListId: {
                productId: change.productId,
                priceListId: change.priceListId,
              },
            },
            data: { amountMinor: change.beforeAmountMinor },
          });
        await this.audit.recordInTransaction(tx, {
          organizationId: change.organizationId,
          actorId: actorId ?? undefined,
          entityType: "PRODUCT",
          entityId: change.productId,
          action: "PRODUCT_PRICE_SYNC_REVERTED",
          before: {
            amountMinor: change.afterAmountMinor?.toString() ?? null,
            referencePriceMinor: change.afterReferenceMinor.toString(),
          },
          after: {
            amountMinor: change.beforeAmountMinor?.toString() ?? null,
            referencePriceMinor:
              change.beforeReferenceMinor?.toString() ?? null,
            runId,
          },
        });
        return true;
      });
      if (done) reverted += 1;
      else kept.push(change.productId);
    }
    await this.prisma.priceRefreshRun.update({
      where: { id: runId },
      data: { revertedAt: new Date() },
    });
    return { runId, changes: run.changes.length, reverted, kept };
  }

  async recentRuns(limit = 10) {
    return this.prisma.priceRefreshRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
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
      ? references.filter((reference) =>
          sameGtin(reference.barcode, product.externalReferenceBarcode),
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

  private async alfaBetaReferences(name: string): Promise<MedicineReference[]> {
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
}

function isReferenceSource(value: string | null): value is ReferenceSource {
  return (
    value === "official" ||
    value === "preciosderemedios" ||
    value === "alfabeta"
  );
}

// Ejecuta tareas con un máximo de `limit` simultáneas.
export async function runLimited(
  tasks: (() => Promise<void>)[],
  limit: number,
) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      await task();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
}
