import {
  Box,
  CalendarClock,
  CalendarX2,
  PackageX,
  PackageMinus,
} from "lucide-react";
import type { CatalogProduct, StockLot } from "./lib/api";
import {
  catalogMetricCounts,
  type CatalogMetricKey,
} from "./lib/product-catalog-metrics";

export function ProductCatalogTitle() {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 via-teal-600 to-teal-800 text-white shadow-sm ring-1 ring-inset ring-white/30">
        <Box size={27} strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Productos
        </h1>
      </div>
    </div>
  );
}

const metrics = [
  {
    key: "out",
    label: "Sin stock",
    icon: PackageX,
    tone: "catalog-metric-empty",
  },
  {
    key: "low",
    label: "Stock bajo",
    icon: PackageMinus,
    tone: "catalog-metric-low",
  },
  {
    key: "expiring",
    label: "Por vencer (90 días)",
    icon: CalendarClock,
    tone: "catalog-metric-expiring",
  },
  {
    key: "expired",
    label: "Vencidos",
    icon: CalendarX2,
    tone: "catalog-metric-expired",
  },
] as const;

export function ProductCatalogMetrics({
  products,
  stock,
  selected,
  onSelect,
}: {
  products: Pick<CatalogProduct, "id" | "active">[];
  stock: Pick<
    StockLot,
    "productId" | "quantity" | "sellableQuantity" | "expiryStatus"
  >[];
  selected?: CatalogMetricKey;
  onSelect: (key: CatalogMetricKey) => void;
}) {
  const counts = catalogMetricCounts(products, stock);
  return (
    <div aria-label="Resumen del catálogo" className="catalog-summary-metrics">
      {metrics.map(({ key, label, icon: Icon, tone }) => (
        <button
          key={key}
          type="button"
          aria-pressed={selected === key}
          title={
            selected === key
              ? "Quitar el filtro"
              : "Mostrar sólo estos productos"
          }
          onClick={() => onSelect(key)}
          className={`catalog-summary-metric ${tone}`}
        >
          <span aria-hidden="true" className="catalog-summary-icon">
            <Icon size={25} strokeWidth={1.65} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-slate-800">
              {counts[key].toLocaleString("es-AR")}
            </span>
            <span className="block text-[13px] text-slate-500">{label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
