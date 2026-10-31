import type { CatalogProduct, StockLot } from "./api";
export type ReviewUnit = "" | "BOX" | "BLISTER" | "UNIT" | "MIXED";
export type ImportLine = { name: string; quantity: number; page: number };
export function parseOrderPage(text: string, page: number): ImportLine[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(\d{1,7})\s+([\p{L}][^\r\n]{1,180})$/u);
    if (
      !match ||
      Number(match[1]) < 1 ||
      /^p[áa]g(?:ina)?[.\s]/i.test(match[2]!)
    )
      return [];
    return [{ quantity: Number(match[1]), name: match[2]!.trim(), page }];
  });
}
export function normalizeMedicine(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d)\s+(mg|ml|g|%)/g, "$1$2")
    .replace(/\bx\s+(\d)/g, "x$1")
    .replace(/(\d)\s*x\s*(\d)/g, "$1 x$2")
    .replace(/\s+/g, " ")
    .trim();
}
export function orderTotal(text: string): number | null {
  const totals = [
    ...text.matchAll(
      /Pendientes\s+globales\s+\d{1,2}\/\d{1,2}\/\d{4}\s+(\d+)/gi,
    ),
  ].map((match) => Number(match[1]));
  return totals.length && totals.every((total) => total === totals[0])
    ? totals[0]!
    : null;
}

export type RememberedMatch = {
  productId: string;
  productName: string;
  unit: ReviewUnit;
};
export function rememberedMatch(
  name: string,
  memory: Record<string, RememberedMatch>,
  products: Pick<CatalogProduct, "id" | "name" | "active">[],
) {
  const saved = memory[normalizeMedicine(name)];
  return saved &&
    products.some(
      (p) =>
        p.active && p.id === saved.productId && p.name === saved.productName,
    ) &&
    ["BOX", "BLISTER", "UNIT"].includes(saved.unit)
    ? saved
    : undefined;
}

// Prepare only a draft. The API remains responsible for the transactional stock check.
export function planDistribution(
  lines: { productId: string; quantity: number }[],
  stock: Pick<
    StockLot,
    "id" | "productId" | "sellableQuantity" | "expiresAt"
  >[],
  reserved: { lotId: string; quantity: number }[],
) {
  const used = new Map(reserved.map((item) => [item.lotId, item.quantity]));
  const items: { lotId: string; quantity: number }[] = [];
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1)
      throw new Error("Cantidad inválida");
    let remaining = line.quantity;
    const lots = stock
      .filter(
        (lot) => lot.productId === line.productId && lot.sellableQuantity > 0,
      )
      .sort(
        (a, b) =>
          (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999") ||
          a.id.localeCompare(b.id),
      );
    for (const lot of lots) {
      const quantity = Math.min(
        remaining,
        Math.max(0, lot.sellableQuantity - (used.get(lot.id) ?? 0)),
      );
      if (quantity > 0) {
        items.push({ lotId: lot.id, quantity });
        used.set(lot.id, (used.get(lot.id) ?? 0) + quantity);
        remaining -= quantity;
      }
      if (!remaining) break;
    }
  }
  return items;
}
export function medicineCandidates<
  T extends Pick<CatalogProduct, "id" | "name" | "active">,
>(name: string, products: T[]) {
  const normalized = normalizeMedicine(name);
  const active = products.filter((p) => p.active);
  const exact = active.filter((p) => normalizeMedicine(p.name) === normalized);
  if (exact.length) return { exact: true, products: exact };
  const words = normalized.split(/\s+/);
  return {
    exact: false,
    products: active
      .filter((p) => {
        const label = normalizeMedicine(p.name);
        return words.some(
          (word) => word.length > 3 && !/\d/.test(word) && label.includes(word),
        );
      })
      .slice(0, 8),
  };
}
export function shortage(
  quantity: number,
  available: number,
  requested: ReviewUnit,
  recorded: ReviewUnit,
  reviewed: boolean,
) {
  if (!Number.isSafeInteger(available) || available < 0) return null;
  if (
    !reviewed ||
    !requested ||
    !recorded ||
    requested === "MIXED" ||
    recorded === "MIXED" ||
    requested !== recorded ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    return null;
  return Math.max(0, quantity - Math.max(0, available));
}
