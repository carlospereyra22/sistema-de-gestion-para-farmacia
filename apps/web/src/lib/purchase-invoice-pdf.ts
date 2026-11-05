import type { ExcelMapping } from "./purchase-excel";

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  rotated?: boolean;
};
export type InvoiceLine = {
  code: string;
  name: string;
  quantity: number | null;
  cost: number | null;
  text: string;
};

/** Columnas de la tabla que arma `invoiceSheet`, para reutilizar la revisión del Excel. */
export const invoiceMapping: ExcelMapping = {
  code: 0,
  name: 1,
  quantity: 2,
  cost: 3,
};

/** Arma renglones con los textos que comparten altura, ordenados de izquierda a derecha. */
export function invoiceTextLines(items: PdfTextItem[], tolerance = 2.5) {
  // Las leyendas legales van giradas en el margen y comparten altura con los
  // renglones. Si toda la página está girada, se conserva.
  const upright = items.filter((item) => !item.rotated && item.str.trim());
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of upright.length ? upright : items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  // En PDF la coordenada y crece hacia arriba.
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(" ")
        .replace(/\s+/g, " "),
    );
}

const barcodePattern = /(?<![\d.,])\d{8,14}(?![\d.,])/;
const moneyPattern = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

const money = (token: string) =>
  Math.round(Number(token.replace(/\./g, "").replace(",", ".")) * 100);

/**
 * Lee un renglón de factura sin depender del orden de las columnas: cada
 * droguería ubica distinto el código, la cantidad y los precios, pero siempre
 * se cumple cantidad × precio unitario = importe del renglón.
 */
export function parseInvoiceLine(text: string): InvoiceLine | null {
  const code = text.match(barcodePattern)?.[0];
  if (!code) return null;
  const tokens = text.replace(code, " ").split(/\s+/).filter(Boolean);
  const numbers = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => moneyPattern.test(token));
  if (numbers.length < 2) return null;
  let best:
    | { q: number; p: number; t: number; tIndex: number; error: number }
    | undefined;
  for (const q of numbers) {
    if (!/^\d+$/.test(q.token)) continue;
    const quantity = Number(q.token);
    if (quantity < 1 || quantity > 100_000) continue;
    for (const p of numbers) {
      if (p.index === q.index) continue;
      for (const t of numbers) {
        if (t.index <= p.index || t.index === q.index) continue;
        const unit = money(p.token);
        const total = money(t.token);
        const error = Math.abs(quantity * unit - total);
        if (!unit || error > Math.max(2, quantity)) continue;
        // El importe suele ser el último número del renglón; a igual
        // posición gana el que cierra mejor la cuenta.
        if (
          !best ||
          t.index > best.tIndex ||
          (t.index === best.tIndex && error < best.error)
        )
          best = { q: quantity, p: unit, t: total, tIndex: t.index, error };
      }
    }
  }
  // Sin cuenta que cierre, sólo interesa si parece un renglón con precios
  // (para revisarlo); un CUIT o un GLN sueltos no son productos.
  if (!best && numbers.filter(({ token }) => token.includes(",")).length < 2)
    return null;
  const isFlag = (token: string) =>
    /^[*#%]+$/.test(token) || /^[A-Za-z]\*?$/.test(token);
  const wordIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(token) && !isFlag(token))
    .map(({ index }) => index);
  const name = wordIndexes.length
    ? tokens.slice(wordIndexes[0], wordIndexes.at(-1)! + 1).join(" ")
    : "";
  return {
    code,
    name,
    quantity: best?.q ?? null,
    cost: best ? best.p / 100 : null,
    text,
  };
}

/**
 * Renglones de producto de la factura. Los que tienen código de barras y
 * precios pero no cierran la cuenta se devuelven sin cantidad para revisarlos.
 */
export function parseInvoiceLines(lines: string[]): InvoiceLine[] {
  return lines
    .map(parseInvoiceLine)
    .filter((line): line is InvoiceLine => line !== null);
}

/** Tabla con la forma que espera `previewPurchaseExcel` (sin fila de encabezado). */
export function invoiceSheet(lines: InvoiceLine[]): unknown[][] {
  return lines.map((line) => [
    line.code,
    line.name,
    line.quantity === null ? "" : String(line.quantity),
    line.cost,
  ]);
}
