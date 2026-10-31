import { Box, Boxes, BadgeCheck, PackageX, PackageMinus } from "lucide-react";
import type { CatalogProduct, StockLot } from "./lib/api";

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

export function ProductCatalogMetrics({
  products,
  stock,
}: {
  products: Pick<CatalogProduct, "id" | "active">[];
  stock: Pick<StockLot, "productId" | "quantity" | "sellableQuantity">[];
}) {
  const quantities = new Map<string, number>();
  for (const lot of stock)
    quantities.set(
      lot.productId,
      (quantities.get(lot.productId) ?? 0) + lot.quantity,
    );
  const active = products.filter((p) => p.active);
  const sellable = new Map<string, number>();
  for (const lot of stock)
    sellable.set(
      lot.productId,
      (sellable.get(lot.productId) ?? 0) + lot.sellableQuantity,
    );
  const metrics = [
    {
      label: "Total de productos",
      value: products.length,
      icon: Boxes,
      tone: "catalog-metric-total",
    },
    {
      label: "Activos",
      value: active.length,
      icon: BadgeCheck,
      tone: "catalog-metric-active",
    },
    {
      label: "Sin stock",
      value: active.filter((p) => (quantities.get(p.id) ?? 0) === 0).length,
      icon: PackageX,
      tone: "catalog-metric-empty",
    },
    {
      label: "Stock bajo",
      value: active.filter((p) => {
        const quantity = sellable.get(p.id) ?? 0;
        return quantity > 0 && quantity <= 5;
      }).length,
      icon: PackageMinus,
      tone: "catalog-metric-low",
    },
  ];
  return (
    <div aria-label="Resumen del catálogo" className="catalog-summary-metrics">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={`catalog-summary-metric ${tone}`}>
          <span aria-hidden="true" className="catalog-summary-icon">
            <Icon size={25} strokeWidth={1.65} />
          </span>
          <div className="min-w-0">
            <p className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-slate-800">
              {value.toLocaleString("es-AR")}
            </p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
