import { DOSIS_PEDIATRICAS } from "./dosis-pediatricas";
import {
  categoriaDeForma,
  dosisParaForma,
  usoParaForma,
  viaSinForma,
  esCombinacionConGuiaSimple,
  viaParaForma,
} from "./dosis-por-forma";
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
import { DOSIS_ORIENTATIVAS } from "./guias-dosis.data";
import {
  dosisParaPresentacion,
  leerFichaAlfaBeta,
  mismoNombre,
  slugAlfaBeta,
} from "./dosis-marcas";
import { dosisDe } from "./equivalentes";
import { sinEquivalencia } from "./equivalentes.service";
import {
  claveGuia,
  guiasDesdePadron,
  vinculosPadron,
} from "./guias-principio-activo";
import type { MedicineReference } from "./medicine-reference.service";

const REMEDIES_URL = "https://preciosderemedios.com.ar/result/";
// El archivo de carga inicial todavía contiene estos enlaces amplios. La
// migración corrige las bases existentes; este mapa corrige cargas nuevas.
const REMEDIES_LINK_CORRECTIONS = new Map([
  [
    `${REMEDIES_URL}?busqueda=acido&combo=Acidos+grasos+omega+3+al+90%25`,
    `${REMEDIES_URL}?busqueda=Acidos+grasos+omega+3+al+90%25&combo=Acidos+grasos+omega+3+al+90%25`,
  ],
  [
    `${REMEDIES_URL}?busqueda=acido&combo=Alfa+hidroxi%C3%A1cidos`,
    `${REMEDIES_URL}?busqueda=Alfa+hidroxi%C3%A1cidos&combo=Alfa+hidroxi%C3%A1cidos`,
  ],
  [
    `${REMEDIES_URL}?busqueda=vita&combo=Asc%C3%B3rbico+%C3%A1cido`,
    `${REMEDIES_URL}?busqueda=vitamina+c&combo=Asc%C3%B3rbico+%C3%A1cido`,
  ],
]);
const REQUEST_PAUSE_MS = 1500;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 40;
const SOURCE_CONCURRENCY = 8;
// Tantos links seguidos sin respuesta: la fuente está caída, no se insiste.
const MAX_CONSECUTIVE_FAILURES = 5;
const WRITE_CHUNK = 2000;
const SEARCH_CANDIDATES = 300;
const SEARCH_RESULTS = 30;
/** Base de medicamentos para buscar sin conexión en la PC (SISTEMA-69). */ export type BaseLocalMedicamentos =
  {
    version: string;
    /** null: la PC ya tiene esta versión. */ items:
      | {
          n: string;
          p: string;
          l: string;
          d: string;
          f: string;
          s: string;
          t: string;
          o: string;
          pr: string;
          u: string;
          b: string[];
          x?: 1;
        }[]
      | null;
    packs: { barcode: string; baseBarcode: string; factor: number }[] | null;
  };

function transientSourceError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return (
    cause.name === "TimeoutError" ||
    /timeout|fetch failed|respondi[oó] (?:429|5\d\d)|no est[aá] disponible/i.test(
      cause.message,
    )
  );
}

function sourceTimedOut(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.name === "TimeoutError" || /timeout/i.test(cause.message))
  );
}

export type CatalogImportRecord =
  | {
      kind: "pending";
      externalKey: string;
      name: string;
      presentation: string;
      activeIngredient: string;
      laboratory: string;
      pharmaceuticalForm: string;
      saleCondition: string;
      barcodes: string[];
      reason: string;
    }
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

  private nextSourceRequestAt = 0;

  // Espacia el inicio de las solicitudes, aunque varias páginas se lean en paralelo.
  private async waitForSourceRequest(): Promise<void> {
    const now = Date.now();
    const startAt = Math.max(now, this.nextSourceRequestAt);
    this.nextSourceRequestAt = startAt + REQUEST_PAUSE_MS;
    if (startAt > now) await this.pause(startAt - now);
  }

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

  /**
   * Toda la base para la PC (SISTEMA-69): así se busca sin conexión. Se baja
   * sólo si cambió desde la versión que ya tiene la PC (la actualización de
   * precios de las 9 y las 17 la cambia). Claves cortas: son ~18.000 filas.
   */
  /**
   * Códigos de toda la base, por medicamento. Se piden aparte: como relación,
   * Prisma arma un `IN` con un id por medicamento, que PostgreSQL rechaza
   * pasados los 32.767 (SISTEMA-74).
   */
  private async codigosPorMedicamento() {
    const codigos = new Map<
      string,
      { barcode: string; gtin: string | null }[]
    >();
    for (const {
      itemId,
      barcode,
      gtin,
    } of await this.prisma.medicineCatalogBarcode.findMany({
      select: { itemId: true, barcode: true, gtin: true },
      orderBy: { id: "asc" },
    })) {
      const lista = codigos.get(itemId);
      if (lista) lista.push({ barcode, gtin });
      else codigos.set(itemId, [{ barcode, gtin }]);
    }
    return codigos;
  }

  async baseLocal(versionDeLaPc?: string): Promise<BaseLocalMedicamentos> {
    const [resumen, packs] = await Promise.all([
      this.prisma.medicineCatalogItem.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true, priceUpdatedAt: true },
      }),
      this.prisma.medicineCatalogPack.findMany({
        select: { barcode: true, baseBarcode: true, factor: true },
        orderBy: { barcode: "asc" },
      }),
    ]);
    const version = [
      resumen._count._all,
      resumen._max.updatedAt?.getTime() ?? 0,
      resumen._max.priceUpdatedAt?.getTime() ?? 0,
      packs.length,
      packs.reduce((suma, pack) => suma + pack.factor, 0),
    ].join("-");
    if (versionDeLaPc === version) return { version, items: null, packs: null };
    const [items, codigos] = await Promise.all([
      this.prisma.medicineCatalogItem.findMany({
        orderBy: [{ name: "asc" }, { presentation: "asc" }],
      }),
      this.codigosPorMedicamento(),
    ]);
    return {
      version,
      packs,
      items: items.map((item) => ({
        n: item.name,
        p: item.presentation,
        l: item.laboratory,
        d: item.activeIngredient,
        f: item.pharmaceuticalForm,
        s: item.saleCondition,
        t: item.troquel,
        o: item.priceSource,
        pr: String(item.priceMinor),
        u: item.priceUpdatedAt.toISOString(),
        b: [
          ...new Set((codigos.get(item.id) ?? []).map((code) => code.barcode)),
        ],
        ...(item.officialDelisted ? { x: 1 as const } : {}),
      })),
    };
  }

  // Referencias de toda la base, una por código distinto: las usa la corrida
  // para actualizar los productos vinculados.
  async references(): Promise<MedicineReference[]> {
    const [items, codigos] = await Promise.all([
      this.prisma.medicineCatalogItem.findMany(),
      this.codigosPorMedicamento(),
    ]);
    return items.flatMap((item) => {
      const codes = new Map<string, string>();
      for (const { barcode, gtin } of codigos.get(item.id) ?? [])
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
    // Las guías no deben frenar la actualización de precios.
    await this.actualizarGuias(payload).catch((cause: unknown) =>
      this.logger.warn(
        `No se pudieron actualizar las guías por principio activo: ${cause instanceof Error ? cause.message : "error desconocido"}`,
      ),
    );
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
        (url, group) => this.recoverRemediesRows(url, group),
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
    recover?: (
      url: string,
      group: CatalogItemForRefresh[],
    ) => Promise<SourceRow[]>,
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
    const entries = [...links];
    let next = 0;
    const worker = async () => {
      while (next < entries.length && !result.stopped) {
        const entry = entries[next++];
        if (!entry) break;
        const [url, group] = entry;
        let rows: SourceRow[] | null = null;
        let error: unknown = null;
        try {
          const wanted = new Set(group.map((item) => item.sourceRowKey));
          try {
            rows = await read(url, wanted);
          } catch (cause) {
            if (!transientSourceError(cause)) throw cause;
            if (recover && sourceTimedOut(cause)) {
              this.logger.warn(
                `El enlace de medicamentos agotó el tiempo; se buscan sus productos por nombre: ${url}`,
              );
              try {
                rows = await recover(url, group);
              } catch (recoveryCause) {
                this.logger.warn(
                  `Falló la búsqueda por nombre (${recoveryCause instanceof Error ? recoveryCause.message : "error desconocido"}); se reintenta el enlace: ${url}`,
                );
                rows = await read(url, wanted);
              }
            } else {
              this.logger.warn(`Reintentando enlace de medicamentos: ${url}`);
              rows = await read(url, wanted);
            }
          }
        } catch (cause) {
          error = cause;
        }
        result.links += 1;
        if (error !== null || rows === null) {
          result.failedLinks += 1;
          failures += 1;
          this.logger.warn(
            `No se pudo leer ${url}: ${error instanceof Error ? error.message : "error desconocido"}`,
          );
          if (failures >= MAX_CONSECUTIVE_FAILURES) {
            result.stopped = true;
            return;
          }
        } else {
          failures = 0;
          await this.applyRows(group, rows, aliases, result);
        }
        if (result.links % 50 === 0)
          this.logger.log(
            `Base de medicamentos: ${result.links}/${entries.length} enlaces revisados, ${result.failedLinks} fallidos.`,
          );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SOURCE_CONCURRENCY, entries.length) }, () =>
        worker(),
      ),
    );
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
    const found = new Set<string>();
    const visited = new Map<number, boolean>();
    const configuredPage = Number(new URL(url).searchParams.get("pagina"));
    const firstPage =
      Number.isInteger(configuredPage) &&
      configuredPage >= 1 &&
      configuredPage <= MAX_PAGES
        ? configuredPage
        : 1;
    const readPage = async (page: number) => {
      const target = new URL(url);
      if (page === 1) target.searchParams.delete("pagina");
      else target.searchParams.set("pagina", String(page));
      await this.waitForSourceRequest();
      const response = await fetch(target, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Respondió ${response.status}.`);
      const html = await response.text();
      for (const row of parseRemediesRows(html)) {
        rows.push(row);
        found.add(row.rowKey);
      }
      visited.set(page, remediesHasMorePages(html));
    };
    const complete = () => [...wanted].every((key) => found.has(key));

    // Un enlace a página 2 o 3 suele resolverse con una sola solicitud. Si la
    // paginación cambió, se vuelve al inicio y se busca la fila exacta.
    await readPage(firstPage);
    if (complete()) return rows;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (!visited.has(page)) await readPage(page);
      if (complete() || visited.get(page) === false) break;
    }
    return rows;
  }

  // Algunos enlaces históricos buscan sustancias demasiado amplias y el sitio
  // no responde. Conservamos su filtro de combinación y acotamos la búsqueda
  // a cada nombre, sin aceptar una fila distinta como precio del producto.
  private async recoverRemediesRows(
    url: string,
    group: CatalogItemForRefresh[],
  ): Promise<SourceRow[]> {
    const recovered: SourceRow[] = [];
    const searched = new Set<string>();
    const wanted = new Set(group.map((item) => item.sourceRowKey));
    const readByName = async (name: string, keys: Set<string>) => {
      const term = name.trim().toLowerCase();
      if (!term || searched.has(term)) return [];
      searched.add(term);
      const target = new URL(url);
      target.searchParams.set("busqueda", term);
      return this.remediesRows(target.toString(), keys);
    };

    if (group.length > 1) {
      const names = group.map((item) =>
        item.name.trim().toLowerCase().split(/\s+/),
      );
      const firstName = names[0] ?? [];
      let prefixLength = 0;
      while (
        firstName[prefixLength] &&
        names.every((words) => words[prefixLength] === firstName[prefixLength])
      )
        prefixLength += 1;
      const prefix = firstName.slice(0, prefixLength).join(" ");
      const commonSearch =
        prefix || new URL(url).searchParams.get("combo") || "";
      try {
        recovered.push(...(await readByName(commonSearch, wanted)));
      } catch (cause) {
        this.logger.warn(
          `La búsqueda compartida no respondió; se prueban nombres individuales: ${cause instanceof Error ? cause.message : "error desconocido"}`,
        );
      }
    }

    for (const item of group) {
      if (!recovered.some((row) => row.rowKey === item.sourceRowKey)) {
        const itemKeys = new Set([item.sourceRowKey]);
        let rows = await readByName(item.name, itemKeys);
        const words = item.name.trim().split(/\s+/);
        if (!rows.some((row) => itemKeys.has(row.rowKey)) && words.length > 2) {
          rows = await readByName(words.slice(0, -1).join(" "), itemKeys);
        }
        recovered.push(...rows);
      }
    }
    return recovered;
  }

  private async alfaBetaRows(url: string): Promise<SourceRow[]> {
    await this.waitForSourceRequest();
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

  // Guías por principio activo (SISTEMA-108): acción y vía del padrón ya
  // descargado, más uso y dosis orientativos del archivo versionado.
  async actualizarGuias(payload: unknown[]) {
    const guias = guiasDesdePadron(payload, DOSIS_ORIENTATIVAS);
    for (let start = 0; start < guias.length; start += WRITE_CHUNK) {
      const chunk = JSON.stringify(
        guias
          .slice(start, start + WRITE_CHUNK)
          .map((guia) => ({ id: randomUUID(), ...guia })),
      );
      await this.prisma.$executeRaw`
        INSERT INTO "MedicineActiveGuide" ("id", "activeKey", "activeIngredient",
          "therapeuticAction", "route", "usage", "dosage", "dosageSource",
          "updatedAt")
        SELECT row."id", row."activeKey", row."activeIngredient",
          row."therapeuticAction", row."route", row."usage", row."dosage",
          row."dosageSource", now()
        FROM jsonb_to_recordset(${chunk}::jsonb) AS row(
          "id" uuid, "activeKey" text, "activeIngredient" text,
          "therapeuticAction" text, "route" text, "usage" text, "dosage" text,
          "dosageSource" text)
        ON CONFLICT ("activeKey") DO UPDATE SET
          "activeIngredient" = EXCLUDED."activeIngredient",
          "therapeuticAction" = EXCLUDED."therapeuticAction",
          "route" = EXCLUDED."route",
          "usage" = EXCLUDED."usage",
          "dosage" = EXCLUDED."dosage",
          "dosageSource" = EXCLUDED."dosageSource",
          "updatedAt" = now()`;
    }
    // Cada medicamento de la base queda vinculado al principio activo del
    // padrón: por CLAVE y, lo que no la tenga, por código.
    const vinculos = vinculosPadron(payload);
    for (
      let start = 0;
      start < vinculos.porClave.length;
      start += WRITE_CHUNK
    ) {
      const chunk = JSON.stringify(
        vinculos.porClave.slice(start, start + WRITE_CHUNK),
      );
      await this.prisma.$executeRaw`
        UPDATE "MedicineCatalogItem" AS item SET "guideKey" = row."activeKey",
          "therapeuticAction" = row."therapeuticAction"
        FROM jsonb_to_recordset(${chunk}::jsonb) AS row(
          "externalKey" text, "activeKey" text, "therapeuticAction" text)
        WHERE item."externalKey" = row."externalKey"
          AND (item."guideKey" IS DISTINCT FROM row."activeKey"
            OR item."therapeuticAction" IS DISTINCT FROM row."therapeuticAction")`;
    }
    for (
      let start = 0;
      start < vinculos.porCodigo.length;
      start += WRITE_CHUNK
    ) {
      const chunk = JSON.stringify(
        vinculos.porCodigo.slice(start, start + WRITE_CHUNK),
      );
      await this.prisma.$executeRaw`
        UPDATE "MedicineCatalogItem" AS item SET "guideKey" = row."activeKey"
        FROM jsonb_to_recordset(${chunk}::jsonb) AS row(
          "codigo" text, "activeKey" text),
          "MedicineCatalogBarcode" AS code
        WHERE code."itemId" = item."id"
          AND ltrim(code."barcode", '0') = row."codigo"
          AND item."guideKey" = ''`;
    }
    const [vinculados] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM "MedicineCatalogItem"
      WHERE "guideKey" <> ''`;
    return {
      guias: guias.length,
      conDosis: guias.filter((guia) => guia.dosage).length,
      medicamentosVinculados: vinculados?.total ?? 0,
    };
  }

  // Dosis de las marcas que el padrón no escribe (SISTEMA-108), solo para las
  // que alguna farmacia tiene cargadas como producto: se lee la composición de
  // la ficha pública de AlfaBeta, una consulta cada 2 segundos, y se guarda
  // solo cuando el nombre de la ficha es exactamente el de la marca y la
  // composición no es ambigua. Decisión en docs/DECISIONS.md.
  async completarDosisDeMarcas(registro: (mensaje: string) => void = () => {}) {
    const filas = await this.prisma.$queryRaw<
      { id: string; name: string; presentation: string; guideKey: string }[]
    >`
      SELECT DISTINCT i."id", i."name", i."presentation", i."guideKey"
      FROM "MedicineCatalogItem" i
      JOIN "MedicineCatalogBarcode" b ON b."itemId" = i."id"
      JOIN "ProductBarcode" pb ON ltrim(pb."code", '0') = ltrim(b."barcode", '0')
      JOIN "Product" p ON p."id" = pb."productId" AND p."active"
      WHERE i."guideKey" <> '' AND i."doseText" = '' AND NOT i."officialDelisted"`;
    const grupos = new Map<
      string,
      {
        nombre: string;
        componentes: number;
        items: { id: string; presentation: string }[];
      }
    >();
    for (const fila of filas) {
      if (sinEquivalencia(fila.guideKey)) continue;
      if (/asoc\.|^vit\.\+|minerales|^vitaminas/.test(fila.guideKey)) continue;
      if (dosisDe(fila.name, fila.presentation)) continue;
      const clave = slugAlfaBeta(fila.name);
      const grupo = grupos.get(clave) ?? {
        nombre: fila.name,
        componentes: fila.guideKey.split("+").length,
        items: [],
      };
      grupo.items.push({ id: fila.id, presentation: fila.presentation });
      grupos.set(clave, grupo);
    }
    const resumen = {
      marcas: grupos.size,
      sinFicha: 0,
      dudosas: 0,
      completadas: 0,
    };
    if (!grupos.size) return resumen;
    const mapa = await fetch("https://www.alfabeta.net/sitemap.xml", {
      signal: AbortSignal.timeout(60_000),
    }).then((respuesta) => (respuesta.ok ? respuesta.text() : ""));
    const fichas = new Set(
      [...mapa.matchAll(/\/medicamento\/([^/<]+)\.vademecum/g)].map(
        (m) => m[1],
      ),
    );
    for (const [slug, grupo] of grupos) {
      if (!fichas.has(slug)) {
        resumen.sinFicha++;
        continue;
      }
      await new Promise((listo) => setTimeout(listo, 2_000));
      const html = await fetch(
        `https://www.alfabeta.net/medicamento/${slug}.vademecum`,
        { signal: AbortSignal.timeout(20_000), redirect: "manual" },
      )
        .then((respuesta) => (respuesta.ok ? respuesta.text() : ""))
        .catch(() => "");
      const ficha = leerFichaAlfaBeta(html);
      if (!mismoNombre(ficha.titulo, grupo.nombre)) {
        resumen.dudosas++;
        registro(
          `otra ficha: ${grupo.nombre} → ${ficha.titulo || "sin ficha"}`,
        );
        continue;
      }
      // Una por presentación: la dosis va solo a la de la misma forma.
      for (const item of grupo.items) {
        const dosis = dosisParaPresentacion(
          ficha.composicion,
          grupo.componentes,
          item.presentation,
        );
        if (!dosis) {
          resumen.dudosas++;
          registro(`sin dosis segura: ${grupo.nombre} ${item.presentation}`);
          continue;
        }
        await this.prisma.medicineCatalogItem.update({
          where: { id: item.id },
          data: { doseText: dosis, doseSource: "alfabeta" },
        });
        resumen.completadas++;
        registro(`${grupo.nombre} ${item.presentation}: ${dosis}`);
      }
    }
    return resumen;
  }

  // Guía de un producto. Primero por el principio activo del padrón vinculado a
  // sus códigos (el texto de otras fuentes puede estar mal); después por el
  // principio activo cargado en el producto; después por el de la base y, si
  // nada coincide, por el nombre exacto en la base cuando no es ambiguo.
  async guiaDe(
    principioActivo: string | undefined,
    codigos: string[],
    nombre?: string,
    // Forma del producto: la dosis que se muestra es la de esa forma.
    producto: { forma?: string; presentacion?: string } = {},
  ) {
    const encontrada = await this.guiaPorCodigoOPrincipio(
      principioActivo,
      codigos,
      { ...producto, nombre },
    );
    // "BUSCAPINA COMPOSITUM" con la guía de una sola droga (otra fuente le
    // pone solo "dipirona"): esa dosis no es la de la combinación.
    const guia =
      encontrada && esCombinacionConGuiaSimple(nombre ?? "", encontrada)
        ? {
            ...encontrada,
            dosage: "",
            dosageOtherForm: true,
            pediatric: null,
          }
        : encontrada;
    if (guia || !nombre?.trim()) return guia;
    const mismos = await this.prisma.medicineCatalogItem.findMany({
      where: {
        name: { equals: nombre.trim(), mode: "insensitive" },
        guideKey: { not: "" },
      },
      select: { guideKey: true },
      take: 20,
    });
    const claves = new Set(mismos.map((item) => item.guideKey));
    const [clave] = claves;
    return claves.size === 1 && clave
      ? this.guiaPorCodigoOPrincipio(clave, [], producto)
      : null;
  }

  private async guiaPorCodigoOPrincipio(
    principioActivo: string | undefined,
    codigos: string[],
    producto: { forma?: string; presentacion?: string; nombre?: string },
  ) {
    const gtins = codigos
      .map((code) => gtinOf(code))
      .filter((gtin): gtin is string => !!gtin);
    const filas = codigos.length
      ? await this.prisma.medicineCatalogBarcode.findMany({
          where: {
            OR: [{ barcode: { in: codigos } }, { gtin: { in: gtins } }],
          },
          select: {
            item: {
              select: {
                guideKey: true,
                activeIngredient: true,
                therapeuticAction: true,
                doseText: true,
                pharmaceuticalForm: true,
                presentation: true,
                name: true,
              },
            },
          },
          take: 20,
        })
      : [];
    // Dosis o concentración de esta presentación ("500 mg", "50 mg/ml"),
    // solo si todos sus códigos dicen lo mismo.
    const dosisPropias = new Set(
      filas.map((fila) => fila.item.doseText).filter(Boolean),
    );
    const presentationDose =
      dosisPropias.size === 1 ? ([...dosisPropias][0] ?? "") : "";
    // Forma de la presentación: la de la base por código si no hay dudas; si
    // no, la cargada en el producto.
    const categoriasBase = new Set(
      filas.map((fila) =>
        categoriaDeForma(
          fila.item.pharmaceuticalForm,
          fila.item.presentation,
          fila.item.name,
        ),
      ),
    );
    const [categoriaBase] = categoriasBase;
    const categoria =
      categoriasBase.size === 1 && categoriaBase
        ? categoriaBase
        : categoriaDeForma(
            producto.forma,
            producto.presentacion,
            producto.nombre,
          );
    const candidatas = [
      ...filas.map((fila) => fila.item.guideKey),
      claveGuia(principioActivo ?? ""),
      ...filas.map((fila) => claveGuia(fila.item.activeIngredient)),
    ].filter((clave, index, todas) => clave && todas.indexOf(clave) === index);
    for (const clave of candidatas) {
      const guia = await this.prisma.medicineActiveGuide.findUnique({
        where: { activeKey: clave },
        select: {
          activeIngredient: true,
          therapeuticAction: true,
          route: true,
          usage: true,
          dosage: true,
          dosageSource: true,
        },
      });
      if (!guia) continue;
      // La acción de esta presentación, si se conoce, manda sobre la más
      // frecuente del principio activo (Aspirinetas: antiagregante).
      const propia = filas.find(
        (fila) => fila.item.guideKey === clave && fila.item.therapeuticAction,
      )?.item.therapeuticAction;
      const deLaForma = dosisParaForma(guia.dosage, guia.route, categoria);
      return {
        ...guia,
        usage: usoParaForma(guia.usage, guia.route, categoria),
        dosage: deLaForma.dosis,
        // La dosis guardada es de otra forma (ampolla, gel…): se remite al
        // prospecto en vez de mostrar la de los comprimidos.
        dosageOtherForm: deLaForma.otraForma,
        route: categoria
          ? viaParaForma(guia.route, categoria)
          : viaSinForma(guia.dosage, guia.route),
        // Jarabes, gotas y suspensiones: dosis infantil por kilo, si hay.
        pediatric:
          categoria === "liquido" ? (DOSIS_PEDIATRICAS[clave] ?? null) : null,
        therapeuticAction: propia || guia.therapeuticAction,
        presentationDose,
      };
    }
    return null;
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
    const pending = records.flatMap((record) =>
      record.kind === "pending" ? [record] : [],
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
              referenceUrl:
                record.priceSource === "preciosderemedios"
                  ? (REMEDIES_LINK_CORRECTIONS.get(record.referenceUrl ?? "") ??
                    record.referenceUrl)
                  : record.referenceUrl,
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
          // Consiguió precio y link: deja de estar pendiente.
          await tx.medicineCatalogPending.deleteMany({
            where: {
              externalKey: {
                in: chunk.map(({ record }) => record.externalKey),
              },
            },
          });
        }
        const catalogKeys = new Set([
          ...existing,
          ...fresh.map(({ record }) => record.externalKey),
        ]);
        const waiting = pending.filter(
          (record) => !catalogKeys.has(record.externalKey),
        );
        let pendingCreated = 0;
        for (let start = 0; start < waiting.length; start += WRITE_CHUNK) {
          const { count } = await tx.medicineCatalogPending.createMany({
            data: waiting.slice(start, start + WRITE_CHUNK).map((record) => ({
              externalKey: record.externalKey,
              name: record.name,
              presentation: record.presentation,
              activeIngredient: record.activeIngredient,
              laboratory: record.laboratory,
              pharmaceuticalForm: record.pharmaceuticalForm,
              saleCondition: record.saleCondition,
              barcodes: [...new Set(record.barcodes)],
              reason: record.reason,
            })),
            skipDuplicates: true,
          });
          pendingCreated += count;
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
          pending: pendingCreated,
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
      pending: await this.prisma.medicineCatalogPending.count(),
    };
  }
}
