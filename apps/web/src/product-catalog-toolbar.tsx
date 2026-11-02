import {
  Box,
  CalendarDays,
  FilterX,
  FlaskConical,
  Image,
  Layers,
  Link,
  Package,
  Pill,
  ScanBarcode,
  Search,
  Tag,
} from "lucide-react";
import {
  emptyCatalogAdditionalFilters,
  type CatalogAdditionalFilters,
} from "./lib/catalog-additional-filters";
import type { CatalogOptions } from "./lib/api";
import { ProductFilterSelect } from "./product-filter-select";

export type ProductCatalogFilters = {
  query: string;
  category: string;
  laboratory: string;
  status: string;
  stock: string;
  expiry: string;
  reference: string;
  lot: string;
};
export function ProductCatalogToolbar({
  filters,
  onChange,
  options,
  additional = emptyCatalogAdditionalFilters,
  onAdditionalChange,
}: {
  filters: ProductCatalogFilters;
  onChange: (filters: ProductCatalogFilters) => void;
  options?: CatalogOptions;
  additional?: CatalogAdditionalFilters;
  onAdditionalChange: (filters: CatalogAdditionalFilters) => void;
}) {
  // Cuenta todo lo que se aparta de la vista inicial, incluida la búsqueda.
  const count =
    Object.values(filters).filter(Boolean).length +
    Object.values(additional).filter(Boolean).length;
  const update = (key: keyof ProductCatalogFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  const updateAdditional = (
    key: "kind" | "reference" | "image" | "barcode",
    value: string,
  ) => onAdditionalChange({ ...additional, [key]: value });
  return (
    <div className="product-catalog-toolbar rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-teal-50/30 px-4 pb-4 pt-4 shadow-[0_8px_20px_-18px_rgba(15,80,90,.3)]">
      <div className="product-catalog-controls grid grid-cols-2 gap-3">
        <label className="product-catalog-search col-span-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
          <Search size={17} className="shrink-0 text-teal-600" />
          <input
            aria-label="Buscar productos"
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
            placeholder="Buscar por nombre, código de barras, laboratorio..."
            className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
          />
        </label>
        <label className="product-catalog-lot-search col-span-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-teal-500">
          <Layers size={17} className="shrink-0 text-teal-600" />
          <input
            aria-label="Buscar por lote"
            value={filters.lot}
            onChange={(e) => update("lot", e.target.value)}
            placeholder="Buscar por lote..."
            className="h-12 w-full min-w-0 border-0 bg-transparent p-0 !text-sm shadow-none outline-none"
          />
        </label>
        <ProductFilterSelect
          label="Categoría"
          icon={<Box size={18} />}
          value={filters.category}
          onChange={(v) => update("category", v)}
          options={[
            { value: "", label: "Todas" },
            ...(options?.categories.map((v) => ({
              value: v.id,
              label: v.path ?? v.name,
            })) ?? []),
          ]}
        />
        <ProductFilterSelect
          label="Laboratorio"
          icon={<FlaskConical size={18} />}
          value={filters.laboratory}
          onChange={(v) => update("laboratory", v)}
          options={[
            { value: "", label: "Todos" },
            ...(options?.laboratories.map((v) => ({
              value: v.id,
              label: v.name,
            })) ?? []),
          ]}
        />
        <ProductFilterSelect
          label="Estado"
          icon={<Tag size={18} />}
          value={filters.status}
          onChange={(v) => update("status", v)}
          options={[
            { value: "", label: "Activos" },
            { value: "inactive", label: "Archivados" },
          ]}
        />
        <ProductFilterSelect
          label="Stock"
          icon={<Package size={18} />}
          value={filters.stock}
          onChange={(v) => update("stock", v)}
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
          onChange={(v) => update("expiry", v)}
          options={[
            { value: "", label: "Todos" },
            { value: "expired", label: "Vencidos" },
            { value: "expiring-30", label: "Próximos 30 días" },
            { value: "expiring-60", label: "Próximos 60 días" },
            { value: "expiring", label: "Próximos 90 días" },
            { value: "undated", label: "Sin fecha" },
          ]}
        />
        <ProductFilterSelect
          label="Tipo"
          icon={<Pill size={18} />}
          value={additional.kind ?? ""}
          onChange={(v) => updateAdditional("kind", v)}
          options={[
            { value: "", label: "Todos" },
            { value: "medicine", label: "Medicamentos" },
            { value: "other", label: "Otros productos" },
          ]}
        />
        <ProductFilterSelect
          label="Precio automático"
          icon={<Link size={18} />}
          value={additional.reference}
          onChange={(v) => updateAdditional("reference", v)}
          options={[
            { value: "", label: "Todos" },
            { value: "linked", label: "Se actualiza solo" },
            { value: "unlinked", label: "Precio manual" },
          ]}
        />
        <ProductFilterSelect
          label="Foto"
          icon={<Image size={18} />}
          value={additional.image}
          onChange={(v) => updateAdditional("image", v)}
          options={[
            { value: "", label: "Todos" },
            { value: "with", label: "Con foto" },
            { value: "without", label: "Sin foto" },
          ]}
        />
        <ProductFilterSelect
          label="Código de barras"
          icon={<ScanBarcode size={18} />}
          value={additional.barcode}
          onChange={(v) => updateAdditional("barcode", v)}
          options={[
            { value: "", label: "Todos" },
            { value: "with", label: "Con código" },
            { value: "without", label: "Sin código" },
          ]}
        />
        <button
          type="button"
          disabled={!count}
          onClick={() => {
            onChange(emptyCatalogFilters);
            onAdditionalChange(emptyCatalogAdditionalFilters);
          }}
          className="product-catalog-clear inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:border-teal-300 hover:bg-teal-50 disabled:cursor-default disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
        >
          <FilterX size={16} />
          Limpiar filtros
          {count > 0 && (
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-700">
              {count}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

const emptyCatalogFilters: ProductCatalogFilters = {
  query: "",
  category: "",
  laboratory: "",
  status: "",
  stock: "",
  expiry: "",
  reference: "",
  lot: "",
};
