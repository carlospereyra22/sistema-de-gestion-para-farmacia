import { useEffect } from "react";
import type { CatalogProduct } from "./lib/api";
import { saleCatalogRowId, saleProductDetail } from "./lib/sale-catalog";
import { stockLevel } from "./lib/stock-level";
import { ProductThumbnail } from "./product-image";

const money = (minor: string | number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );
const amount = (minor: string | number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);

export type SaleCatalogRow = {
  product: CatalogProduct;
  available: number;
  expired: number;
};

// La seleccion se maneja desde el buscador (aria-activedescendant): el foco
// queda en el campo para que el lector de codigos siga entrando ahi.
export function SaleCatalogTable({
  token,
  organizationId,
  idPrefix,
  rows,
  selectedId,
  hiddenCount = 0,
  onSelect,
  onAdd,
}: {
  token: string;
  organizationId: string;
  idPrefix: string;
  rows: SaleCatalogRow[];
  selectedId?: string;
  hiddenCount?: number;
  onSelect: (productId: string) => void;
  onAdd: (productId: string) => void;
}) {
  useEffect(() => {
    if (!selectedId) return;
    document
      .getElementById(saleCatalogRowId(idPrefix, selectedId))
      ?.scrollIntoView({ block: "nearest" });
  }, [idPrefix, selectedId]);
  return (
    // La tabla se adapta a su propio ancho (container query): angosta, oculta Categoría.
    <div className="sale-catalog-card @container min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
      <table
        id={idPrefix}
        role="grid"
        aria-label="Catálogo de productos"
        className="w-full table-fixed text-sm"
      >
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 text-left">Producto</th>
            <th className="sale-catalog-category hidden w-32 px-2 py-2.5 text-left @min-[34rem]:table-cell">
              Categoría
            </th>
            <th className="w-16 px-2 py-2.5 text-right @min-[34rem]:w-[76px]">
              Stock
            </th>
            {/* Ancho para importes de hasta $ 99.999.999,99 sin cortar. */}
            <th className="w-[132px] px-3 py-2.5 text-right">Precio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ product, available, expired }) => {
            const level = stockLevel(available);
            const price = product.prices[0]?.amountMinor;
            const selected = product.id === selectedId;
            const detail = saleProductDetail(product);
            const stockLabel =
              level === "out" ? "sin stock" : `${available} disponibles`;
            return (
              <tr
                key={product.id}
                id={saleCatalogRowId(idPrefix, product.id)}
                aria-selected={selected}
                aria-label={`${product.name}, ${stockLabel}, ${price === undefined ? "sin precio" : money(price)}`}
                onClick={() => onSelect(product.id)}
                onDoubleClick={() => onAdd(product.id)}
                className={`cursor-pointer transition-colors ${selected ? "bg-teal-50/60 shadow-[inset_3px_0_0_#0d9488]" : "hover:bg-slate-50/70"} ${level === "out" ? "opacity-75" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Sin ampliar: un clic en la fila sólo la elige. */}
                    <ProductThumbnail
                      token={token}
                      organizationId={organizationId}
                      productId={product.id}
                      name={product.name}
                      version={product.image?.updatedAt}
                      preview={false}
                    />
                    <div className="min-w-0">
                      <span
                        className="block truncate text-[15px] font-medium text-slate-900"
                        title={product.name}
                      >
                        {product.name}
                      </span>
                      {level === "out" && expired > 0 ? (
                        <span className="block truncate text-xs text-rose-600">
                          {expired} vencidas · no vendibles
                        </span>
                      ) : (
                        <span
                          className="block truncate text-xs text-slate-500"
                          title={detail || undefined}
                        >
                          {detail || "Sin detalle farmacéutico"}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="sale-catalog-category hidden px-2 py-2 @min-[34rem]:table-cell">
                  {product.category ? (
                    <span
                      className="block truncate text-sm text-slate-600"
                      title={product.category.name}
                    >
                      {product.category.name}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {level === "out" ? (
                    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-slate-100 px-2 text-[11px] font-medium text-slate-600">
                      Sin stock
                    </span>
                  ) : level === "low" ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                      <span
                        aria-hidden
                        className="size-[7px] rounded-full bg-[#f6ac43]"
                      />
                      {available}
                    </span>
                  ) : (
                    available
                  )}
                </td>
                <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right font-semibold tabular-nums">
                  {price === undefined ? (
                    "—"
                  ) : (
                    // El importe reserva el ancho de 9.999.999,99: todos los $ quedan
                    // en la misma vertical y sólo un precio mayor corre el suyo.
                    <span className="inline-flex items-baseline gap-1">
                      <span aria-hidden>$</span>
                      <span className="inline-block min-w-[10.5ch] text-right">
                        {amount(price)}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p className="px-3 py-8 text-center text-sm text-slate-500">
          No hay productos para esta búsqueda.
        </p>
      )}
      {hiddenCount > 0 && (
        <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-500">
          Hay {hiddenCount} productos más. Escribí para acotar la búsqueda.
        </p>
      )}
    </div>
  );
}
