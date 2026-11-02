import type { StockLot } from "./api";
import { stockLevel, type StockLevel } from "./stock-level";

// Indicadores de Productos: cada uno equivale a un filtro de la tabla.
export type CatalogMetricKey = "out" | "low" | "expiring" | "expired";

export type CatalogMetricFilters = { stock: string; expiry: string };
type MetricFilters = { stock: "" | "out" | "low"; expiry: string };

type MetricLot = Pick<
  StockLot,
  "productId" | "quantity" | "sellableQuantity" | "expiryStatus"
>;

const metricFilters: Record<CatalogMetricKey, MetricFilters> = {
  out: { stock: "out", expiry: "" },
  low: { stock: "low", expiry: "" },
  expiring: { stock: "", expiry: "expiring" },
  expired: { stock: "", expiry: "expired" },
};

export function catalogStockTotals(stock: MetricLot[]) {
  const physical = new Map<string, number>();
  const sellable = new Map<string, number>();
  for (const lot of stock) {
    physical.set(
      lot.productId,
      (physical.get(lot.productId) ?? 0) + lot.quantity,
    );
    sellable.set(
      lot.productId,
      (sellable.get(lot.productId) ?? 0) + lot.sellableQuantity,
    );
  }
  return { physical, sellable };
}

// Sin stock mira existencias físicas (los vencidos siguen siendo stock físico);
// stock bajo mira unidades vendibles, igual que Ventas y notificaciones.
export function catalogStockTone(
  physical: number,
  sellable: number,
): StockLevel {
  if (physical <= 0) return "out";
  return stockLevel(sellable) === "low" ? "low" : "ok";
}

export function catalogMetricCounts(
  products: { id: string; active: boolean }[],
  stock: MetricLot[],
): Record<CatalogMetricKey, number> {
  const { physical, sellable } = catalogStockTotals(stock);
  const withLots = (status: MetricLot["expiryStatus"]) =>
    new Set(
      stock
        .filter((lot) => lot.quantity > 0 && lot.expiryStatus === status)
        .map((lot) => lot.productId),
    );
  const expiring = withLots("EXPIRING_SOON");
  const expired = withLots("EXPIRED");
  const counts = { out: 0, low: 0, expiring: 0, expired: 0 };
  for (const product of products) {
    if (!product.active) continue;
    const tone = catalogStockTone(
      physical.get(product.id) ?? 0,
      sellable.get(product.id) ?? 0,
    );
    if (tone === "out") counts.out++;
    if (tone === "low") counts.low++;
    if (expiring.has(product.id)) counts.expiring++;
    if (expired.has(product.id)) counts.expired++;
  }
  return counts;
}

export function activeCatalogMetric(
  filters: CatalogMetricFilters,
): CatalogMetricKey | undefined {
  return (Object.keys(metricFilters) as CatalogMetricKey[]).find(
    (key) =>
      metricFilters[key].stock === filters.stock &&
      metricFilters[key].expiry === filters.expiry,
  );
}

// Tocar un indicador lo deja como único filtro de stock/vencimiento;
// tocarlo de nuevo quita ambos.
export function toggleCatalogMetric(
  key: CatalogMetricKey,
  filters: CatalogMetricFilters,
): MetricFilters {
  return activeCatalogMetric(filters) === key
    ? { stock: "", expiry: "" }
    : metricFilters[key];
}
