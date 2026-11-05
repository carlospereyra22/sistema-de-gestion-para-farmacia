import { CalendarDays, FilterX, Layers, Package, Search } from "lucide-react";
import {
  emptyInventoryFilters,
  type InventoryFilters,
} from "./lib/inventory-products";
import { ProductFilterSelect } from "./product-filter-select";

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("es-AR")} ${count === 1 ? one : many}`;

export function InventoryToolbar({
  filters,
  products,
  lots,
  onChange,
}: {
  filters: InventoryFilters;
  // Resultados de los filtros actuales, para el contador.
  products: number;
  lots: number;
  onChange: (filters: InventoryFilters) => void;
}) {
  const active = Object.values(filters).filter(Boolean).length;
  const update = (key: keyof InventoryFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="product-catalog-toolbar rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-teal-50/30 p-4 shadow-[0_8px_20px_-18px_rgba(15,80,90,.3)]">
      <div className="inventory-filters">
        <label className="inventory-filters-search flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
          <Search size={17} className="shrink-0 text-teal-600" />
          <input
            type="search"
            aria-label="Buscar en inventario"
            value={filters.query}
            onChange={(event) => update("query", event.target.value)}
            placeholder="Buscar por nombre, código de barras, laboratorio..."
            className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
          />
        </label>
        <label className="inventory-filters-lot flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
          <Layers size={17} className="shrink-0 text-teal-600" />
          <input
            type="search"
            aria-label="Buscar por lote"
            value={filters.lot}
            onChange={(event) => update("lot", event.target.value)}
            placeholder="Buscar por lote..."
            className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
          />
        </label>
        <ProductFilterSelect
          label="Stock"
          icon={<Package size={18} />}
          value={filters.stock}
          onChange={(value) => update("stock", value)}
          options={[
            { value: "", label: "Todos" },
            { value: "available", label: "Con stock" },
            { value: "out", label: "Sin stock" },
            { value: "low", label: "Stock bajo" },
          ]}
        />
        <ProductFilterSelect
          label="Vencimiento"
          icon={<CalendarDays size={18} />}
          value={filters.expiry}
          onChange={(value) => update("expiry", value)}
          options={[
            { value: "", label: "Todos" },
            { value: "expired", label: "Vencidos" },
            { value: "expiring-30", label: "Próximos 30 días" },
            { value: "expiring-60", label: "Próximos 60 días" },
            { value: "expiring", label: "Próximos 90 días" },
            { value: "undated", label: "Sin fecha" },
          ]}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-slate-500">
          {plural(products, "producto", "productos")} ·{" "}
          {plural(lots, "lote", "lotes")}
        </p>
        <button
          type="button"
          disabled={!active}
          onClick={() => onChange(emptyInventoryFilters)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap !text-xs font-medium text-teal-700 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
        >
          <FilterX size={14} />
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
