import type { CatalogProduct, PurchaseDraftLine } from "./api";

export type ExcelColumn = "code" | "name" | "quantity" | "cost";
export type ExcelMapping = Record<ExcelColumn, number | null>;
export type ExcelSheet = { sheet: string; data: unknown[][] };
export type ImportRow = {
  rowNumber: number;
  name: string;
  code: string;
  quantity: string;
  cost: string;
  productId: string | null;
  matchedBy: "code" | "name" | null;
  issue: string | null;
};

const aliases: Record<ExcelColumn, string[]> = {
  code: [
    "codigo de barras",
    "codigo barra",
    "cod barra",
    "ean",
    "gtin",
    "upc",
    "barcode",
    "codigo",
    "cod producto",
    "sku",
  ],
  name: [
    "producto",
    "descripcion",
    "descripcion producto",
    "nombre",
    "articulo",
    "detalle",
  ],
  quantity: [
    "cantidad",
    "cant",
    "unidades",
    "unidades pedidas",
    "cantidad pedida",
    "cant pedida",
    "qty",
  ],
  cost: [
    "costo unitario",
    "precio unitario",
    "precio compra",
    "precio neto",
    "costo",
    "precio",
    "p unitario",
  ],
};

export function normalizePurchaseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function excelCellText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value);
  return "";
}

export function detectExcelHeader(data: unknown[][]): {
  headerRow: number;
  mapping: ExcelMapping;
} {
  let best = {
    headerRow: 0,
    mapping: { code: null, name: null, quantity: null, cost: null } as ExcelMapping,
    score: -1,
  };
  for (const [rowIndex, row] of data.slice(0, 25).entries()) {
    const mapping: ExcelMapping = {
      code: null,
      name: null,
      quantity: null,
      cost: null,
    };
    for (const [columnIndex, cell] of row.entries()) {
      const label = normalizePurchaseText(excelCellText(cell));
      if (!label) continue;
      for (const column of Object.keys(aliases) as ExcelColumn[]) {
        if (
          mapping[column] === null &&
          aliases[column].some(
            (alias) =>
              label === alias ||
              (label.startsWith(`${alias} `) && alias.length > 5),
          )
        ) {
          mapping[column] = columnIndex;
          break;
        }
      }
    }
    const score =
      Number(mapping.code !== null) +
      Number(mapping.name !== null) +
      Number(mapping.quantity !== null) * 2 +
      Number(mapping.cost !== null);
    if (score > best.score) best = { headerRow: rowIndex, mapping, score };
  }
  return { headerRow: best.headerRow, mapping: best.mapping };
}

export function parseExcelQuantity(value: unknown): string {
  const raw = excelCellText(value).replace(/\s/g, "");
  if (!raw) return "";
  const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw)
    ? raw.replace(/[.,]/g, "")
    : raw;
  const quantity = Number(normalized);
  return /^\d+$/.test(normalized) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1_000_000
    ? String(quantity)
    : "";
}

export function parseExcelCost(value: unknown): string {
  const raw = excelCellText(value)
    .replace(/(?:AR\$|ARS|\$|\s)/gi, "")
    .trim();
  if (!raw || !/^[\d.,]+$/.test(raw)) return "";
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  const decimalDigits = raw.length - decimalAt - 1;
  const hasDecimal = decimalAt >= 0 && decimalDigits >= 1 && decimalDigits <= 2;
  const digits = (hasDecimal ? raw.slice(0, decimalAt) : raw).replace(/[.,]/g, "");
  const fraction = hasDecimal ? raw.slice(decimalAt + 1) : "";
  if (!/^\d+$/.test(digits) || (hasDecimal && !/^\d{1,2}$/.test(fraction)))
    return "";
  const cents = BigInt(digits) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return "";
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function previewPurchaseExcel(
  data: unknown[][],
  headerRow: number,
  mapping: ExcelMapping,
  products: CatalogProduct[],
): ImportRow[] {
  const available = products.filter(
    (product) =>
      product.active &&
      (!product.branchStatus || product.branchStatus === "ACTIVE"),
  );
  const codeIndex = new Map<string, CatalogProduct[]>();
  const nameIndex = new Map<string, CatalogProduct[]>();
  for (const product of available) {
    for (const barcode of product.barcodes) {
      const key = barcode.code.trim();
      codeIndex.set(key, [...(codeIndex.get(key) ?? []), product]);
    }
    const name = normalizePurchaseText(product.name);
    nameIndex.set(name, [...(nameIndex.get(name) ?? []), product]);
  }
  const rows: ImportRow[] = [];
  for (const [offset, row] of data.slice(headerRow + 1).entries()) {
    const get = (column: ExcelColumn) =>
      mapping[column] === null ? null : row[mapping[column]!];
    const code = excelCellText(get("code")).replace(/\s/g, "");
    const name = excelCellText(get("name"));
    const rawQuantity = get("quantity");
    const quantity = parseExcelQuantity(rawQuantity);
    const rawCost = get("cost");
    const cost = parseExcelCost(rawCost);
    if (!code && !name && !excelCellText(rawQuantity)) continue;
    const byCode = code ? codeIndex.get(code) ?? [] : [];
    const barcodeLike = /^\d{8,14}$/.test(code);
    const byName = !byCode.length && (!code || !barcodeLike)
      ? nameIndex.get(normalizePurchaseText(name)) ?? []
      : [];
    const candidates = byCode.length ? byCode : byName;
    const product = candidates.length === 1 ? candidates[0] : undefined;
    rows.push({
      rowNumber: headerRow + offset + 2,
      name,
      code,
      quantity,
      cost,
      productId: product?.id ?? null,
      matchedBy: product ? (byCode.length ? "code" : "name") : null,
      issue: !quantity
        ? "Cantidad inválida o vacía"
        : candidates.length > 1
          ? "Coincidencia ambigua"
          : !product
            ? "Elegí un producto"
            : rawCost !== null && rawCost !== undefined && excelCellText(rawCost) && !cost
              ? "Costo para revisar"
              : null,
    });
  }
  return rows;
}

export function purchaseExcelLines(
  rows: ImportRow[],
  selected: Set<number>,
  assigned: Record<number, string>,
  existing: PurchaseDraftLine[],
): PurchaseDraftLine[] {
  const used = new Set(existing.map((line) => line.productId));
  const result: PurchaseDraftLine[] = [];
  for (const row of rows) {
    if (!selected.has(row.rowNumber) || !row.quantity || used.size >= 100)
      continue;
    const productId = assigned[row.rowNumber] || row.productId;
    if (!productId || used.has(productId)) continue;
    used.add(productId);
    result.push({ productId, quantity: row.quantity, cost: row.cost });
  }
  return result;
}
