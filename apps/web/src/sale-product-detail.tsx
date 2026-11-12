import { useState } from "react";
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Minus,
  Package,
  Plus,
} from "lucide-react";
import type { DetalleOfertaVenta } from "./lib/ofertas-carrito";
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
  ofertas = [],
  onAddCombo,
}: {
  /**
   * Ofertas vigentes del producto (SISTEMA-103). Si tiene, el bloque muestra
   * primero la oferta y se puede volver a la cara con la foto.
   */
  ofertas?: DetalleOfertaVenta[];
  onAddCombo?: (componentes: { productId: string; cantidad: number }[]) => void;
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
  // Cara que se ve: la oferta (si hay) o el producto. Se reinicia al cambiar
  // de producto.
  const [cara, setCara] = useState<{
    productId?: string;
    vista: "oferta" | "producto";
    indice: number;
  }>({ vista: "oferta", indice: 0 });
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
  const actual =
    cara.productId === product.id
      ? cara
      : { productId: product.id, vista: "oferta" as const, indice: 0 };
  const verCara = (vista: "oferta" | "producto", indice = actual.indice) =>
    setCara({ productId: product.id, vista, indice });
  const oferta = ofertas[Math.min(actual.indice, ofertas.length - 1)];
  if (oferta && actual.vista === "oferta") {
    const componentes = oferta.combo?.componentes ?? [];
    // Hasta 5 productos a la vista; si hay más, el último renglón lo resume.
    const visibles = componentes.slice(0, componentes.length > 5 ? 4 : 5);
    return (
      <div
        aria-label="Oferta del producto"
        className="sale-product-detail flex h-[108px] shrink-0 items-stretch gap-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50/80 to-white px-3 py-2"
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {oferta.combo ? (
            <ul aria-label="Productos del combo">
              {visibles.map((item) => (
                <li
                  key={item.productId}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-1.5 text-[12px] leading-[17px]"
                  title={item.nombre}
                >
                  <span className="text-right font-bold text-rose-700">
                    {item.cantidad}×
                  </span>
                  <span className="truncate text-slate-700">{item.nombre}</span>
                  <span className="tabular-nums text-slate-500">
                    {money(item.precioMinor * item.cantidad)}
                  </span>
                </li>
              ))}
              {componentes.length > visibles.length && (
                <li className="pl-8 text-[11px] leading-4 text-slate-500">
                  y {componentes.length - visibles.length} productos más
                </li>
              )}
            </ul>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800">
                {oferta.texto}
              </p>
              <p className="truncate text-xs text-slate-500">{product.name}</p>
            </>
          )}
        </div>
        <div className="flex w-40 shrink-0 flex-col justify-center border-l border-rose-100 pl-3 text-right tabular-nums">
          <p className="flex min-w-0 items-center justify-end gap-1.5">
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
              {oferta.combo ? (
                <Package size={10} />
              ) : (
                <BadgePercent size={10} />
              )}
              {oferta.label}
            </span>
            <span
              className="truncate text-xs font-semibold text-slate-800"
              title={oferta.nombre}
            >
              {oferta.nombre}
            </span>
          </p>
          {ofertas.length > 1 && (
            <p className="flex items-center justify-end text-[11px] text-slate-500">
              <button
                type="button"
                aria-label="Oferta anterior"
                disabled={actual.indice <= 0}
                onClick={() => verCara("oferta", actual.indice - 1)}
                className="rounded hover:bg-rose-100 disabled:opacity-30"
              >
                <ChevronLeft size={13} />
              </button>
              {Math.min(actual.indice, ofertas.length - 1) + 1}/{ofertas.length}
              <button
                type="button"
                aria-label="Oferta siguiente"
                disabled={actual.indice >= ofertas.length - 1}
                onClick={() => verCara("oferta", actual.indice + 1)}
                className="rounded hover:bg-rose-100 disabled:opacity-30"
              >
                <ChevronRight size={13} />
              </button>
            </p>
          )}
          {oferta.combo ? (
            <>
              <span className="mt-0.5 text-[11px] text-slate-400 line-through">
                {money(oferta.combo.listaMinor)}
              </span>
              <span className="text-lg font-bold leading-6 text-teal-800">
                {money(oferta.combo.comboMinor)}
              </span>
              {oferta.combo.listaMinor > oferta.combo.comboMinor && (
                <span className="text-[11px] font-semibold text-rose-700">
                  Ahorrás{" "}
                  {money(oferta.combo.listaMinor - oferta.combo.comboMinor)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="mt-0.5 text-lg font-bold leading-6 text-teal-800">
                {price === undefined ? "—" : money(price)}
              </span>
              <span className="text-[11px] text-slate-500">
                por unidad, de lista
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {oferta.combo && onAddCombo ? (
            <button
              type="button"
              onClick={() =>
                onAddCombo(
                  componentes.map((item) => ({
                    productId: item.productId,
                    cantidad: item.cantidad,
                  })),
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[0.65rem] bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus size={16} /> Agregar combo
            </button>
          ) : (
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
          )}
          <button
            type="button"
            onClick={() => verCara("producto")}
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[0.65rem] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <ImageIcon size={15} /> Ver producto
          </button>
        </div>
      </div>
    );
  }
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
          {ofertas.map((item, indice) => (
            <button
              key={item.id}
              type="button"
              title={`Ver la oferta ${item.nombre}`}
              onClick={() => verCara("oferta", indice)}
              className="ml-2 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
            >
              {item.label}
            </button>
          ))}
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
