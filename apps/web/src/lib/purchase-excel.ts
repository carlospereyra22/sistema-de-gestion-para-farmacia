import type { CatalogProduct } from "./api";
import { externalGtin } from "./external-product";
import type { PurchaseDraftLine } from "./purchases";

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
  // Exhibidor: código de la factura y unidades que trae.
  pack?: { code: string; factor: number };
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
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function detectExcelHeader(data: unknown[][]): {
  headerRow: number;
  mapping: ExcelMapping;
} {
  let best = {
    headerRow: 0,
    mapping: {
      code: null,
      name: null,
      quantity: null,
      cost: null,
    } as ExcelMapping,
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
    const body = excelBodyRows(data, rowIndex);
    refineByContent(mapping, body);
    // Pesa más que debajo haya renglones de productos reales que la cantidad de
    // encabezados reconocidos: las droguerías suelen poner arriba la cabecera
    // de la factura, con títulos parecidos pero sin productos.
    const productRows = body.filter(
      (r) =>
        mapping.quantity !== null &&
        parseExcelQuantity(r[mapping.quantity]) &&
        ((mapping.code !== null && isExcelBarcode(r[mapping.code])) ||
          (mapping.name !== null && isExcelText(r[mapping.name]))),
    ).length;
    const score =
      productRows * 10 +
      Number(mapping.code !== null) +
      Number(mapping.name !== null) +
      Number(mapping.quantity !== null) * 2 +
      Number(mapping.cost !== null);
    if (score > best.score) best = { headerRow: rowIndex, mapping, score };
  }
  return { headerRow: best.headerRow, mapping: best.mapping };
}

/** Código de barras como texto, sin espacios ni el ",00" de una celda con formato numérico. */
export function excelBarcode(value: unknown): string {
  const raw = excelCellText(value).replace(/\s/g, "");
  return /^\d+[.,]0+$/.test(raw) ? raw.replace(/[.,]0+$/, "") : raw;
}

// El estándar de ANMAT/GS1 procesa el GTIN con 14 dígitos: 7795312109383 y
// 07795312109383 son el mismo producto. Un código interno se compara tal cual.
const codeKey = (code: string) => externalGtin(code) ?? code;

const isExcelBarcode = (value: unknown) =>
  /^\d{8,14}$/.test(excelBarcode(value));
const isExcelText = (value: unknown) =>
  /[a-z]{3}/.test(normalizePurchaseText(excelCellText(value)));

function excelBodyRows(data: unknown[][], headerRow: number) {
  return data
    .slice(headerRow + 1, headerRow + 51)
    .filter((row) => row.some((cell) => excelCellText(cell)));
}

/**
 * Corrige código y nombre mirando los datos: un encabezado como "Código IVA"
 * empieza igual que "Código" pero no trae códigos de barras, y "Producto Cód."
 * empieza como "Producto" pero no trae nombres.
 */
function refineByContent(mapping: ExcelMapping, body: unknown[][]) {
  if (!body.length) return;
  const columns = Math.max(...body.map((row) => row.length));
  const ratio = (index: number, test: (value: unknown) => boolean) => {
    const filled = body.filter((row) => excelCellText(row[index]));
    return filled.length
      ? filled.filter((row) => test(row[index])).length / body.length
      : 0;
  };
  const taken = () =>
    new Set([mapping.quantity, mapping.cost].filter((i) => i !== null));
  if (mapping.code === null || ratio(mapping.code, isExcelBarcode) < 0.6) {
    let bestCode: number | null = null;
    let bestRatio = 0.6;
    for (let index = 0; index < columns; index++) {
      if (taken().has(index)) continue;
      const value = ratio(index, isExcelBarcode);
      if (value >= bestRatio) [bestCode, bestRatio] = [index, value + 1e-9];
    }
    // Sin columna de barras se conserva la del encabezado: puede traer códigos
    // de uso interno cargados en el catálogo.
    mapping.code = bestCode ?? mapping.code;
  }
  if (
    mapping.name === null ||
    mapping.name === mapping.code ||
    ratio(mapping.name, isExcelText) < 0.6
  ) {
    let bestName: number | null = null;
    let bestLength = 0;
    for (let index = 0; index < columns; index++) {
      if (index === mapping.code || taken().has(index)) continue;
      if (ratio(index, isExcelText) < 0.6) continue;
      const length =
        body.reduce((sum, row) => sum + excelCellText(row[index]).length, 0) /
        body.length;
      if (length > bestLength) [bestName, bestLength] = [index, length];
    }
    mapping.name = bestName;
  }
}

export function parseExcelQuantity(value: unknown): string {
  const raw = excelCellText(value).replace(/\s/g, "");
  if (!raw) return "";
  const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw)
    ? raw.replace(/[.,]/g, "")
    : raw;
  const quantity = Number(normalized);
  return /^\d+$/.test(normalized) &&
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    quantity <= 1_000_000
    ? String(quantity)
    : "";
}

export function parseExcelCost(value: unknown): string {
  // Una celda numérica ya trae el punto decimal real: no hay miles que adivinar.
  if (typeof value === "number") {
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) return "";
    return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  }
  const raw = excelCellText(value)
    .replace(/(?:AR\$|ARS|\$|\s)/gi, "")
    .trim();
  if (!raw || !/^[\d.,]+$/.test(raw)) return "";
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  const decimalDigits = raw.length - decimalAt - 1;
  const hasDecimal = decimalAt >= 0 && decimalDigits >= 1 && decimalDigits <= 2;
  const digits = (hasDecimal ? raw.slice(0, decimalAt) : raw).replace(
    /[.,]/g,
    "",
  );
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
      const key = codeKey(barcode.code.trim());
      const owners = codeIndex.get(key) ?? [];
      if (!owners.includes(product)) codeIndex.set(key, [...owners, product]);
    }
    const name = normalizePurchaseText(product.name);
    nameIndex.set(name, [...(nameIndex.get(name) ?? []), product]);
  }
  const rows: ImportRow[] = [];
  for (const [offset, row] of data.slice(headerRow + 1).entries()) {
    const get = (column: ExcelColumn) =>
      mapping[column] === null ? null : row[mapping[column]!];
    const code = excelBarcode(get("code"));
    const name = excelCellText(get("name"));
    const rawQuantity = get("quantity");
    const quantity = parseExcelQuantity(rawQuantity);
    const rawCost = get("cost");
    const cost = parseExcelCost(rawCost);
    if (!code && !name && !excelCellText(rawQuantity)) continue;
    const byCode = code ? (codeIndex.get(codeKey(code)) ?? []) : [];
    const barcodeLike = /^\d{8,14}$/.test(code);
    const byName =
      !byCode.length && (!code || !barcodeLike)
        ? (nameIndex.get(normalizePurchaseText(name)) ?? [])
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
            : rawCost !== null &&
                rawCost !== undefined &&
                excelCellText(rawCost) &&
                !cost
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
