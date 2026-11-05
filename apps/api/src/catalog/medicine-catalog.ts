import type {
  MedicineCatalogBarcode,
  MedicineCatalogItem,
} from "@prisma/client";
import {
  concentrationFromText,
  parsePriceMinor,
  type MedicineReference,
} from "./medicine-reference.service";
import { snapshotKey } from "./medicine-reference-snapshot";

// Reglas puras de la base de medicamentos (SISTEMA-26). Ver
// docs/MEDICINE_CATALOG.md.

export type CatalogPriceSource = "official" | "preciosderemedios" | "alfabeta";

export type CatalogItemForRefresh = Pick<
  MedicineCatalogItem,
  | "id"
  | "externalKey"
  | "name"
  | "presentation"
  | "laboratory"
  | "priceSource"
  | "priceMinor"
  | "referenceUrl"
  | "sourceRowKey"
  | "troquel"
  | "officialDelisted"
> & { barcodes: Pick<MedicineCatalogBarcode, "barcode">[] };

export type CatalogPriceUpdate = {
  id: string;
  priceMinor: string;
  priceSource: string;
  referenceUrl: string | null;
  sourceRowKey: string;
  troquel: string;
  officialDelisted: boolean;
};

export type OfficialCatalogRow = {
  key: string | null;
  name: string;
  presentation: string;
  barcodes: string[];
  troquel: string;
  priceMinor: number | null;
  delisted: boolean;
};

export type SourceRow = {
  rowKey: string;
  laboratory: string;
  priceMinor: number | null;
};

// Una fila de precio más allá de esto respecto del anterior suele ser otro
// envase: no se aplica y queda para revisar.
const MIN_PRICE_RATIO = 0.5;
const MAX_PRICE_RATIO = 2;

const ALIAS_BLOCKED = new Set(["duda", "distinto"]);

// 'ACALIX A.P.' y 'ACALIX AP' dan lo mismo.
export function compactKey(value: string): string {
  return snapshotKey(value).replace(/[^a-z0-9]/g, "");
}

function plainCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^0+/, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

// Todas las filas del padrón, también las dadas de baja o con un código
// inválido: `officialReferences` las descarta, pero acá hacen falta.
export function officialCatalogRows(payload: unknown[]): OfficialCatalogRow[] {
  const rows: OfficialCatalogRow[] = [];
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const clave = text(item.CLAVE);
    rows.push({
      key: clave ? `ab-${clave}` : null,
      name: text(item.NOMBRE),
      presentation: text(item.PRESENTACION),
      barcodes: [item.C_BARRA, item.GTIN1].map(plainCode).filter(Boolean),
      troquel: text(item.TROQUEL),
      priceMinor: parsePriceMinor(item.PRECIO),
      delisted: String(item.BAJA) === "1",
    });
  }
  return rows;
}

export type OfficialPlan = {
  updates: CatalogPriceUpdate[];
  delisted: string[];
};

// Orden del cruce: CLAVE, código de barras y, solo para lo que ya viene del
// padrón, nombre y presentación exactos. Lo dado de baja sigue publicado con
// precio en la web oficial: lo toma y conserva la marca. Sin precio, solo se
// marca y sigue con la fuente que tenga.
export function planOfficialUpdates(
  items: CatalogItemForRefresh[],
  rows: OfficialCatalogRow[],
): OfficialPlan {
  const byKey = new Map<string, OfficialCatalogRow>();
  const byCode = new Map<string, OfficialCatalogRow>();
  const byName = new Map<string, OfficialCatalogRow[]>();
  for (const row of rows) {
    if (row.key) byKey.set(row.key, row);
    if (row.delisted) continue;
    for (const code of row.barcodes)
      if (!byCode.has(code)) byCode.set(code, row);
    const name = nameKey(row.name, row.presentation);
    byName.set(name, [...(byName.get(name) ?? []), row]);
  }
  const plan: OfficialPlan = { updates: [], delisted: [] };
  for (const item of items) {
    const own = byKey.get(item.externalKey);
    let row = own;
    for (const { barcode } of item.barcodes)
      row ??= byCode.get(plainCode(barcode));
    if (!row && item.priceSource === "official") {
      const named = byName.get(nameKey(item.name, item.presentation)) ?? [];
      if (named.length === 1) row = named[0];
    }
    if (!row?.priceMinor || row.priceMinor <= 0) {
      if (own?.delisted && !item.officialDelisted) plan.delisted.push(item.id);
      continue;
    }
    plan.updates.push({
      id: item.id,
      priceMinor: String(row.priceMinor),
      priceSource: "official",
      referenceUrl: null,
      sourceRowKey: "",
      troquel: row.troquel,
      officialDelisted: row.delisted,
    });
  }
  return plan;
}

function nameKey(name: string, presentation: string) {
  return `${compactKey(name)}|${compactKey(presentation)}`;
}

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_full, hex, decimal) => {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Filas de una página de Precios de Remedios: nombre y presentación vienen en
// dos spans y el precio en `data-price`.
export function parseRemediesRows(html: string): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const match of html.matchAll(
    /<tr\b[^>]*data-price=["']([^"']+)["'][^>]*>[\s\S]*?<\/tr>/gi,
  )) {
    const row = match[0];
    const name = /<span class="font-bold[^"]*">([\s\S]*?)<\/span>/i.exec(row);
    const presentation =
      /<span class="font-normal[^"]*">([\s\S]*?)<\/span>/i.exec(row);
    const laboratory = /class="laboratorio-text[^"]*">([\s\S]*?)<\/div>/i.exec(
      row,
    );
    if (!name?.[1]) continue;
    rows.push({
      rowKey: compactKey(
        `${cleanHtml(name[1])} ${cleanHtml(presentation?.[1] ?? "")}`,
      ),
      laboratory: cleanHtml(laboratory?.[1] ?? ""),
      priceMinor: parsePriceMinor(match[1]),
    });
  }
  return rows;
}

// Lee 'Mostrando 1-15 de 36'.
export function remediesHasMorePages(html: string): boolean {
  const total = /Mostrando\s+\d+-(\d+)\s+de\s+(\d+)/.exec(
    html.replace(/<[^>]+>/g, " "),
  );
  return Boolean(total && Number(total[1]) < Number(total[2]));
}

// AlfaBeta agrega al final la condición de venta: 'comp.rec.x 14 (VL)'.
export function alfaBetaRowKey(presentation: string): string {
  return compactKey(presentation.replace(/\s*\([A-Z]{1,4}\)\s*$/, ""));
}

export type RowDecision =
  | { kind: "price"; priceMinor: bigint }
  | { kind: "missing" }
  | { kind: "review"; reason: string };

// Decide el precio de un producto entre las filas leídas de su link.
export function decideSourceRow(
  item: Pick<
    CatalogItemForRefresh,
    "sourceRowKey" | "laboratory" | "priceMinor" | "priceSource"
  >,
  rows: SourceRow[],
  aliases: Map<string, string>,
): RowDecision {
  const prices = new Set(
    rows
      .filter(
        (row) =>
          row.rowKey === item.sourceRowKey &&
          row.priceMinor !== null &&
          row.priceMinor > 0 &&
          !ALIAS_BLOCKED.has(
            aliases.get(aliasKey(item.laboratory, row.laboratory)) ?? "",
          ),
      )
      .map((row) => row.priceMinor as number),
  );
  if (prices.size !== 1) return { kind: "missing" };
  const [price] = [...prices] as [number];
  const ratio = price / Number(item.priceMinor);
  if (ratio < MIN_PRICE_RATIO || ratio > MAX_PRICE_RATIO)
    return {
      kind: "review",
      reason: `${item.priceSource === "alfabeta" ? "AlfaBeta" : "Precios de Remedios"} informa ${(price / 100).toFixed(2)} y es muy distinto al precio anterior.`,
    };
  return { kind: "price", priceMinor: BigInt(price) };
}

export function aliasKey(catalogName: string, sourceName: string) {
  return `${catalogName}|${sourceName}`;
}

type ItemForReference = Pick<
  MedicineCatalogItem,
  | "name"
  | "presentation"
  | "laboratory"
  | "activeIngredient"
  | "pharmaceuticalForm"
  | "saleCondition"
  | "troquel"
  | "priceSource"
  | "priceMinor"
  | "referenceUrl"
  | "officialDelisted"
  | "laboratoryMismatch"
  | "priceUpdatedAt"
>;

export function referenceFromCatalog(
  item: ItemForReference,
  barcode: string,
): MedicineReference {
  return {
    source: item.priceSource as CatalogPriceSource,
    name: item.name,
    presentation: item.presentation,
    laboratory: item.laboratory,
    activeIngredient: item.activeIngredient,
    barcode,
    troquel: item.troquel,
    priceMinor: Number(item.priceMinor),
    pamiPriceMinor: null,
    updatedAt: item.priceUpdatedAt.toISOString(),
    saleType: item.saleCondition,
    pharmaceuticalForm: item.pharmaceuticalForm,
    concentration: concentrationFromText(item.presentation, item.name),
    ...(item.saleCondition
      ? { prescriptionRequired: /receta/i.test(item.saleCondition) }
      : {}),
    referenceUrl: item.referenceUrl,
    officialDelisted: item.officialDelisted,
    laboratoryMismatch: item.laboratoryMismatch,
  };
}

export function catalogSearchText(item: {
  name: string;
  presentation: string;
  laboratory: string;
  activeIngredient: string;
}) {
  return snapshotKey(
    [item.name, item.presentation, item.laboratory, item.activeIngredient].join(
      " ",
    ),
  );
}

// Palabras de una búsqueda; un producto debe contenerlas todas.
export function catalogSearchWords(query: string): string[] {
  return snapshotKey(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2);
}
