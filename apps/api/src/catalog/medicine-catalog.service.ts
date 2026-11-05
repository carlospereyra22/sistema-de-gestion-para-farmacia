import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { AlfaBetaService } from "./alfabeta.service";
import {
  alfaBetaRowKey,
  aliasKey,
  catalogSearchText,
  catalogSearchWords,
  compactKey,
  decideSourceRow,
  officialCatalogRows,
  parseRemediesRows,
  planOfficialUpdates,
  referenceFromCatalog,
  remediesHasMorePages,
  type CatalogItemForRefresh,
  type CatalogPriceUpdate,
  type SourceRow,
} from "./medicine-catalog";
import { gtinOf, snapshotKey } from "./medicine-reference-snapshot";
import type { MedicineReference } from "./medicine-reference.service";

const REMEDIES_URL = "https://preciosderemedios.com.ar/result/";
const REQUEST_PAUSE_MS = 1500;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 40;
// Tantos links seguidos sin respuesta: la fuente está caída, no se insiste.
const MAX_CONSECUTIVE_FAILURES = 5;
const WRITE_CHUNK = 2000;
const SEARCH_CANDIDATES = 300;
const SEARCH_RESULTS = 30;

export type CatalogImportRecord =
  | {
      kind: "laboratory";
      catalogName: string;
      sourceName: string;
      status: string;
    }
  | {
      kind: "product";
      externalKey: string;
      name: string;
      presentation: string;
      activeIngredient: string;
      laboratory: string;
      pharmaceuticalForm: string;
      saleCondition: string;
      troquel: string;
      priceSource: string;
      priceMinor: number;
      referenceUrl: string | null;
      sourceRow: string;
      officialDelisted: boolean;
      laboratoryMismatch: string | null;
      barcodes: string[];
    };

export type LinkedSourceResult = {
  links: number;
  failedLinks: number;
  updated: number;
  unchanged: number;
  missing: number;
  review: number;
  stopped: boolean;
};

const emptyResult = (): LinkedSourceResult => ({
  links: 0,
  failedLinks: 0,
  updated: 0,
  unchanged: 0,
  missing: 0,
  review: 0,
  stopped: false,
});

const REFRESH_SELECT = {
  id: true,
  externalKey: true,
  name: true,
  presentation: true,
  laboratory: true,
  priceSource: true,
  priceMinor: true,
  referenceUrl: true,
  sourceRowKey: true,
  troquel: true,
  officialDelisted: true,
  barcodes: { select: { barcode: true } },
} as const;

@Injectable()
export class MedicineCatalogService {
  private readonly logger = new Logger(MedicineCatalogService.name);
  // Pausa entre pedidos a una misma fuente. Los tests la reemplazan.
  pause = (ms = REQUEST_PAUSE_MS) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly prisma: PrismaService,
    private readonly alfabeta: AlfaBetaService,
  ) {}

  async byBarcode(code: string): Promise<MedicineReference[]> {
    const value = code.trim();
    const gtin = gtinOf(value);
    const rows = await this.prisma.medicineCatalogBarcode.findMany({
      where: { OR: [{ barcode: value }, ...(gtin ? [{ gtin }] : [])] },
      include: { item: true },
    });
    return rows.map((row) => referenceFromCatalog(row.item, row.barcode));
  }

  packs(codes?: string[]) {
    return this.prisma.medicineCatalogPack.findMany({
      where: codes ? { barcode: { in: codes } } : {},
      select: { barcode: true, baseBarcode: true, factor: true },
    });
  }

  // Guarda un exhibidor. El envase base tiene que estar en la base. Es un dato
  // del envase, igual para todas las farmacias; la auditoría registra quién.
  async savePack(
    actorId: string,
    organizationId: string,
    pack: { barcode: string; baseBarcode: string; factor: number },
  ) {
    if (pack.barcode === pack.baseBarcode)
      throw new BadRequestException(
        "El exhibidor y el envase base no pueden tener el mismo código.",
      );
    if (!(await this.byBarcode(pack.baseBarcode)).length)
      throw new BadRequestException(
        "El envase base no está en la base de medicamentos.",
      );
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.medicineCatalogPack.findUnique({
        where: { barcode: pack.barcode },
        select: { baseBarcode: true, factor: true },
      });
      const saved = await tx.medicineCatalogPack.upsert({
        where: { barcode: pack.barcode },
        create: pack,
        update: { baseBarcode: pack.baseBarcode, factor: pack.factor },
        select: { barcode: true, baseBarcode: true, factor: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          entityType: "MEDICINE_CATALOG_PACK",
          action: "MEDICINE_CATALOG_PACK_SAVED",
          before: before ?? undefined,
          after: saved,
        },
      });
      return saved;
    });
  }

  // Busca por código, nombre, presentación, laboratorio o droga, sin salir a
  // internet. Primero los nombres que empiezan con lo buscado.
  async search(query: string): Promise<MedicineReference[]> {
    if (/^\d{8,14}$/.test(query.trim())) return this.byBarcode(query);
    const words = catalogSearchWords(query);
    if (!words.length) return [];
    const items = await this.prisma.medicineCatalogItem.findMany({
      where: { AND: words.map((word) => ({ searchText: { contains: word } })) },
      include: { barcodes: { take: 1, orderBy: { gtin: "asc" } } },
      orderBy: [{ name: "asc" }, { presentation: "asc" }],
      take: SEARCH_CANDIDATES,
    });
    const start = snapshotKey(query);
    const first = (name: string) =>
      snapshotKey(name).startsWith(start) ? 0 : 1;
    return items
      .map((item, position) => ({ item, position }))
      .sort(
        (a, b) =>
          first(a.item.name) - first(b.item.name) || a.position - b.position,
      )
      .slice(0, SEARCH_RESULTS)
      .map(({ item }) =>
        referenceFromCatalog(item, item.barcodes[0]?.barcode ?? ""),
      );
  }

  // Referencias de toda la base, una por código distinto: las usa la corrida
  // para actualizar los productos vinculados.
  async references(): Promise<MedicineReference[]> {
    const items = await this.prisma.medicineCatalogItem.findMany({
      include: { barcodes: true },
    });
    return items.flatMap((item) => {
      const codes = new Map<string, string>();
      for (const { barcode, gtin } of item.barcodes)
        if (!codes.has(gtin ?? barcode)) codes.set(gtin ?? barcode, barcode);
      return (codes.size ? [...codes.values()] : [""]).map((barcode) =>
        referenceFromCatalog(item, barcode),
      );
    });
  }

  // Actualiza la base con la descarga del padrón ya validada.
  async refreshOfficial(payload: unknown[]) {
    const items = await this.refreshItems();
    const plan = planOfficialUpdates(items, officialCatalogRows(payload));
    await this.savePrices(plan.updates);
    if (plan.delisted.length)
      await this.prisma.medicineCatalogItem.updateMany({
        where: { id: { in: plan.delisted } },
        data: { officialDelisted: true },
      });
    return { updated: plan.updates.length, delisted: plan.delisted.length };
  }

  // Precios de Remedios y AlfaBeta se leen por su link guardado: un pedido por
  // link (más sus páginas), no uno por producto.
  async refreshLinkedSources() {
    const items = await this.refreshItems();
    const aliases = new Map(
      (await this.prisma.medicineLaboratoryAlias.findMany()).map((alias) => [
        aliasKey(alias.catalogName, alias.sourceName),
        alias.status,
      ]),
    );
    return {
      remedies: await this.refreshSource(
        items.filter((item) => item.priceSource === "preciosderemedios"),
        aliases,
        (url, wanted) => this.remediesRows(url, wanted),
      ),
      alfabeta: await this.refreshSource(
        items.filter((item) => item.priceSource === "alfabeta"),
        aliases,
        (url) => this.alfaBetaRows(url),
      ),
    };
  }

  private refreshItems(): Promise<CatalogItemForRefresh[]> {
    return this.prisma.medicineCatalogItem.findMany({ select: REFRESH_SELECT });
  }

  private async refreshSource(
    items: CatalogItemForRefresh[],
    aliases: Map<string, string>,
    read: (url: string, wanted: Set<string>) => Promise<SourceRow[]>,
  ) {
    const result = emptyResult();
    const links = new Map<string, CatalogItemForRefresh[]>();
    for (const item of items)
      if (item.referenceUrl)
        links.set(item.referenceUrl, [
          ...(links.get(item.referenceUrl) ?? []),
          item,
        ]);
    let failures = 0;
    for (const [url, group] of links) {
      result.links += 1;
      let rows: SourceRow[];
      try {
        rows = await read(url, new Set(group.map((item) => item.sourceRowKey)));
        failures = 0;
      } catch (cause) {
        result.failedLinks += 1;
        failures += 1;
        this.logger.warn(
          `No se pudo leer ${url}: ${cause instanceof Error ? cause.message : "error desconocido"}`,
        );
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          result.stopped = true;
          break;
        }
        await this.pause();
        continue;
      }
      await this.applyRows(group, rows, aliases, result);
      await this.pause();
    }
    return result;
  }

  private async applyRows(
    group: CatalogItemForRefresh[],
    rows: SourceRow[],
    aliases: Map<string, string>,
    result: LinkedSourceResult,
  ) {
    const updates: CatalogPriceUpdate[] = [];
    for (const item of group) {
      const decision = decideSourceRow(item, rows, aliases);
      if (decision.kind === "missing") result.missing += 1;
      else if (decision.kind === "review") {
        result.review += 1;
        await this.prisma.medicineCatalogItem.update({
          where: { id: item.id },
          data: { reviewReason: decision.reason },
        });
      } else {
        if (decision.priceMinor === item.priceMinor) result.unchanged += 1;
        else result.updated += 1;
        updates.push({
          id: item.id,
          priceMinor: decision.priceMinor.toString(),
          priceSource: item.priceSource,
          referenceUrl: item.referenceUrl,
          sourceRowKey: item.sourceRowKey,
          troquel: item.troquel,
          officialDelisted: item.officialDelisted,
        });
      }
    }
    await this.savePrices(updates);
  }

  private async remediesRows(url: string, wanted: Set<string>) {
    if (!url.startsWith(REMEDIES_URL))
      throw new Error("Link de Precios de Remedios inválido.");
    const rows: SourceRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const target = new URL(url);
      if (page > 1) target.searchParams.set("pagina", String(page));
      const response = await fetch(target, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Respondió ${response.status}.`);
      const html = await response.text();
      rows.push(...parseRemediesRows(html));
      const pending = [...wanted].some(
        (key) => !rows.some((row) => row.rowKey === key),
      );
      if (!pending || !remediesHasMorePages(html)) break;
      await this.pause();
    }
    return rows;
  }

  private async alfaBetaRows(url: string): Promise<SourceRow[]> {
    const page = await this.alfabeta.page(url);
    return page.presentations.map((row) => ({
      rowKey: alfaBetaRowKey(row.presentation),
      laboratory: "",
      priceMinor: row.priceMinor,
    }));
  }

  // Una sola escritura por tanda. La fecha de precio cambia solo si el precio
  // cambió; la de revisión, siempre.
  private async savePrices(updates: CatalogPriceUpdate[]) {
    for (let start = 0; start < updates.length; start += WRITE_CHUNK) {
      const chunk = JSON.stringify(updates.slice(start, start + WRITE_CHUNK));
      await this.prisma.$executeRaw`
        UPDATE "MedicineCatalogItem" AS item SET
          "priceUpdatedAt" = CASE WHEN item."priceMinor" <> row."priceMinor"::bigint
            THEN now() ELSE item."priceUpdatedAt" END,
          "priceMinor" = row."priceMinor"::bigint,
          "priceSource" = row."priceSource",
          "referenceUrl" = row."referenceUrl",
          "sourceRowKey" = row."sourceRowKey",
          "troquel" = row."troquel",
          "officialDelisted" = row."officialDelisted",
          "laboratoryMismatch" = CASE WHEN row."priceSource" = 'official'
            THEN NULL ELSE item."laboratoryMismatch" END,
          "reviewReason" = NULL,
          "priceCheckedAt" = now(),
          "updatedAt" = now()
        FROM jsonb_to_recordset(${chunk}::jsonb) AS row(
          "id" uuid, "priceMinor" text, "priceSource" text, "referenceUrl" text,
          "sourceRowKey" text, "troquel" text, "officialDelisted" boolean)
        WHERE item."id" = row."id"`;
    }
  }

  // Carga inicial. Solo agrega lo que falta: repetirla no pisa los precios que
  // la corrida ya actualizó.
  async importRecords(records: CatalogImportRecord[]) {
    const products = records.flatMap((record) =>
      record.kind === "product" ? [record] : [],
    );
    const laboratories = records.flatMap((record) =>
      record.kind === "laboratory" ? [record] : [],
    );
    return this.prisma.$transaction(
      async (tx) => {
        const existing = new Set(
          (
            await tx.medicineCatalogItem.findMany({
              select: { externalKey: true },
            })
          ).map((item) => item.externalKey),
        );
        const fresh = products
          .filter((record) => !existing.has(record.externalKey))
          .map((record) => ({ record, id: randomUUID() }));
        for (let start = 0; start < fresh.length; start += WRITE_CHUNK) {
          const chunk = fresh.slice(start, start + WRITE_CHUNK);
          await tx.medicineCatalogItem.createMany({
            data: chunk.map(({ record, id }) => ({
              id,
              externalKey: record.externalKey,
              name: record.name,
              presentation: record.presentation,
              activeIngredient: record.activeIngredient,
              laboratory: record.laboratory,
              pharmaceuticalForm: record.pharmaceuticalForm,
              saleCondition: record.saleCondition,
              troquel: record.troquel,
              priceSource: record.priceSource,
              priceMinor: BigInt(record.priceMinor),
              referenceUrl: record.referenceUrl,
              sourceRowKey: compactKey(record.sourceRow),
              officialDelisted: record.officialDelisted,
              laboratoryMismatch: record.laboratoryMismatch,
              searchText: catalogSearchText(record),
            })),
          });
          await tx.medicineCatalogBarcode.createMany({
            data: chunk.flatMap(({ record, id }) =>
              [...new Set(record.barcodes)].map((barcode) => ({
                itemId: id,
                barcode,
                gtin: gtinOf(barcode),
              })),
            ),
          });
        }
        await tx.medicineLaboratoryAlias.createMany({
          data: laboratories.map(({ catalogName, sourceName, status }) => ({
            catalogName,
            sourceName,
            status,
          })),
          skipDuplicates: true,
        });
        return {
          created: fresh.length,
          skipped: products.length - fresh.length,
          laboratories: laboratories.length,
        };
      },
      { timeout: 120_000 },
    );
  }

  // Cada ambiente tiene su base: la fecha es la de la última lectura de precios
  // en esta base, haya cambiado o no algún precio.
  async status() {
    const result = await this.prisma.medicineCatalogItem.aggregate({
      _count: { _all: true },
      _max: { priceCheckedAt: true },
    });
    return {
      items: result._count._all,
      lastCheckedAt: result._max.priceCheckedAt?.toISOString() ?? null,
    };
  }

  async summary() {
    const groups = await this.prisma.medicineCatalogItem.groupBy({
      by: ["priceSource"],
      _count: { _all: true },
    });
    return {
      sources: Object.fromEntries(
        groups.map((group) => [group.priceSource, group._count._all]),
      ),
      delisted: await this.prisma.medicineCatalogItem.count({
        where: { officialDelisted: true },
      }),
      review: await this.prisma.medicineCatalogItem.count({
        where: { reviewReason: { not: null } },
      }),
    };
  }
}
