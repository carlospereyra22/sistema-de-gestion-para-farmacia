import { Minus, Plus } from "lucide-react";
import type { CatalogProduct } from "./lib/api";
import { ProductThumbnail } from "./product-image";
import { saleProductDetail } from "./lib/sale-catalog";
import { SaleQuantityInput } from "./sale-quantity-input";

const money = (minor: string | number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

export function SaleProductDetail({
  token,
  organizationId,
  product,
  available,
  quantity,
  onQuantityChange,
  onAdd,
  onClear,
  onFinished,
  onInvalid,
}: {
  token: string;
  organizationId: string;
  product?: CatalogProduct;
  available: number;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAdd: () => void;
  onClear: () => void;
  onFinished: () => void;
  onInvalid: (message: string) => void;
}) {
  if (!product)
    return (
      <div className="sale-product-detail flex h-[108px] shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 text-center text-sm text-slate-500">
        Elegí un producto de la lista o escaneá un código.
      </div>
    );
  const price = product.prices[0]?.amountMinor;
  const code =
    product.barcodes.find((barcode) => barcode.primary)?.code ??
    product.barcodes[0]?.code;
  const maximum = Math.max(available, 1);
  return (
    <div
      aria-label="Producto elegido"
      // Mismo alto vacío o con producto: elegir no mueve la tabla de arriba.
      className="sale-product-detail flex h-[108px] shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3"
    >
      <div className="shrink-0">
        <ProductThumbnail
          token={token}
          organizationId={organizationId}
          productId={product.id}
          name={product.name}
          version={product.image?.updatedAt}
          large
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-base font-semibold text-slate-900"
          title={product.name}
        >
          {product.name}
        </p>
        <p className="truncate text-xs text-slate-500">
          {[
            saleProductDetail(product),
            code,
            available > 0 ? `${available} disponibles` : "Sin stock vendible",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="whitespace-nowrap text-lg font-bold tabular-nums text-teal-800">
            {price === undefined ? "—" : money(price)}
          </span>
          <div className="sale-quantity-stepper w-24">
            <button
              type="button"
              aria-label="Restar unidad a agregar"
              disabled={quantity <= 1}
              onClick={() => onQuantityChange(quantity - 1)}
              className="p-1.5 text-slate-600 hover:text-teal-700 disabled:opacity-40"
            >
              <Minus size={15} />
            </button>
            <SaleQuantityInput
              quantity={quantity}
              maximum={maximum}
              name={`${product.name} a agregar`}
              onCommit={onQuantityChange}
              onFinished={onFinished}
              onInvalid={onInvalid}
            />
            <button
              type="button"
              aria-label="Sumar unidad a agregar"
              disabled={quantity >= maximum}
              onClick={() => onQuantityChange(quantity + 1)}
              className="p-1.5 text-slate-600 hover:text-teal-700 disabled:opacity-40"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button
          type="button"
          disabled={available <= 0}
          onClick={onAdd}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[0.65rem] border border-[#0f9b8e] bg-white px-3 text-sm font-semibold text-[#087f70] hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          <Plus size={16} /> Agregar
          <kbd className="rounded border border-current px-1 text-[10px] font-medium">
            Enter
          </kbd>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[0.65rem] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Limpiar
          <kbd className="rounded border border-slate-300 px-1 text-[10px] font-medium">
            Esc
          </kbd>
        </button>
      </div>
    </div>
  );
}
