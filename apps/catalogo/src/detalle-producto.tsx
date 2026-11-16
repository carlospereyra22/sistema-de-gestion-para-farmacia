import { useEffect } from "react";
import { Minus, Plus, Sparkles, X } from "lucide-react";

import { FotoProducto } from "./foto-producto";
import { PildoraOferta, PrecioConOferta } from "./oferta-ui";
import type { Cotizacion, ProductoCatalogo } from "./lib/api";
import { pesos } from "./lib/carrito";

/**
 * Producto ampliado al tocar su foto (SISTEMA-107). En el celular sube desde
 * abajo; en la compu se abre centrado. Se cierra con la X, tocando afuera o Esc.
 */
export function DetalleProducto({
  slug,
  producto,
  cotizacion,
  cantidad,
  onCantidad,
  onCerrar,
}: {
  slug: string;
  producto: ProductoCatalogo;
  cotizacion: Cotizacion | null;
  cantidad: number;
  onCantidad: (cantidad: number) => void;
  onCerrar: () => void;
}) {
  const enCarrito = cotizacion?.items.find((i) => i.productId === producto.id);
  const sugerencia = cotizacion?.sugerencias.find((s) =>
    s.productIds.includes(producto.id),
  );
  useEffect(() => {
    const tecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    // Mientras está abierto, la página de atrás no se mueve.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={producto.name}
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCerrar}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="pie-seguro relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:flex-row sm:rounded-3xl"
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onCerrar}
          className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow ring-1 ring-slate-200 hover:text-slate-900"
        >
          <X size={20} aria-hidden />
        </button>
        <div className="relative shrink-0 border-b border-slate-100 sm:w-1/2 sm:border-b-0 sm:border-r">
          <FotoProducto
            slug={slug}
            productId={producto.id}
            name={producto.name}
            hasImage={producto.hasImage}
            version={producto.imageVersion}
            className="aspect-square max-h-[50dvh] w-full sm:max-h-none"
          />
          {!producto.inStock ? (
            <span className="absolute left-3 top-3 rounded-full bg-slate-900/75 px-2.5 py-1 text-xs font-medium text-white">
              Sin stock
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5 sm:p-7">
          {producto.brand ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              {producto.brand}
            </p>
          ) : null}
          <h2 className="pr-10 text-xl font-bold leading-snug">
            {producto.name}
          </h2>
          {producto.presentation ? (
            <p className="text-sm text-slate-500">{producto.presentation}</p>
          ) : null}
          {!producto.inStock ? (
            <p className="text-sm text-amber-700">
              Sin stock por ahora: si lo pedís, la farmacia te confirma si lo
              consigue.
            </p>
          ) : null}
          <div className="mt-2">
            <PrecioConOferta
              priceMinor={producto.priceMinor}
              oferta={producto.ofertas[0]}
              grande
            />
          </div>
          {producto.ofertas.length ? (
            <div className="mt-1 flex flex-col gap-2.5 rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
              {producto.ofertas.map((oferta) => (
                <div
                  key={oferta.id}
                  className="flex flex-col items-start gap-1"
                >
                  <PildoraOferta oferta={oferta} />
                  {oferta.detalle.map((linea) => (
                    <p key={linea} className="text-sm text-slate-700">
                      {linea}
                    </p>
                  ))}
                </div>
              ))}
              {sugerencia ? (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                  <Sparkles size={15} aria-hidden /> {sugerencia.mensaje}
                </p>
              ) : null}
            </div>
          ) : null}
          {enCarrito && enCarrito.discountMinor !== "0" ? (
            <p className="text-sm font-medium text-emerald-700">
              Con {enCarrito.quantity} en el carrito ahorrás{" "}
              {pesos(enCarrito.discountMinor)}
            </p>
          ) : null}
          <div className="mt-auto pt-4">
            {cantidad ? (
              <div className="flex h-12 items-center justify-between rounded-xl bg-teal-50 ring-1 ring-teal-200">
                <button
                  type="button"
                  aria-label={`Quitar uno de ${producto.name}`}
                  onClick={() => onCantidad(cantidad - 1)}
                  className="flex h-full w-14 items-center justify-center rounded-l-xl text-teal-800 active:bg-teal-100"
                >
                  <Minus size={18} aria-hidden />
                </button>
                <span className="text-base font-bold tabular-nums text-teal-900">
                  {cantidad} en el carrito
                </span>
                <button
                  type="button"
                  aria-label={`Agregar uno de ${producto.name}`}
                  onClick={() => onCantidad(cantidad + 1)}
                  className="flex h-full w-14 items-center justify-center rounded-r-xl bg-teal-700 text-white active:bg-teal-800"
                >
                  <Plus size={18} aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onCantidad(1)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-[15px] font-semibold text-white hover:bg-teal-800"
              >
                <Plus size={18} aria-hidden /> Agregar al carrito
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
