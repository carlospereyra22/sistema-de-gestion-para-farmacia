import { BadgePercent, Info, Package, Plus, X } from "lucide-react";

export type SugerenciaCarrito = {
  id: string;
  label: string;
  nombre: string;
  /** Qué agregar y qué gana el cliente si completa la oferta. */
  agregar: string;
  gana: string;
  combo?: boolean;
  /** Combo: qué tiene el carrito y qué falta de cada producto. */
  componentes?: { nombre: string; cantidad: number; enCarrito: number }[];
  accion?: { texto: string; onClick: () => void };
};

/**
 * Ofertas del carrito de Ventas (SISTEMA-103), compactas en el panel de la
 * derecha: una línea por oferta que falta completar (con el botón para
 * hacerlo y la ✕ para descartarla) y el aviso cuando una oferta cambió.
 */
export function SaleCartOffers({
  aviso,
  onCerrarAviso,
  sugerencias,
  onDescartar,
}: {
  aviso?: string;
  onCerrarAviso: () => void;
  sugerencias: SugerenciaCarrito[];
  onDescartar: (id: string) => void;
}) {
  if (!aviso && !sugerencias.length) return null;
  return (
    <section
      aria-label="Ofertas de la venta"
      className="sale-cart-offers max-h-32 shrink-0 space-y-1 overflow-y-auto border-t border-slate-200 bg-white px-5 py-2"
    >
      {aviso && (
        <p
          role="status"
          className="flex h-8 items-center gap-2 rounded-lg bg-amber-50 px-2.5 text-xs font-medium text-amber-900"
        >
          <Info size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{aviso}</span>
          <button
            type="button"
            aria-label="Cerrar aviso de ofertas"
            onClick={onCerrarAviso}
            className="rounded p-0.5 hover:bg-amber-100"
          >
            <X size={13} />
          </button>
        </p>
      )}
      {sugerencias.map((sugerencia) => {
        return (
          <div
            key={sugerencia.id}
            className="flex items-start gap-2 rounded-lg bg-rose-50/60 px-2.5 py-1.5"
          >
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
              {sugerencia.combo ? (
                <Package size={11} />
              ) : (
                <BadgePercent size={11} />
              )}
              {sugerencia.label}
            </span>
            <p
              className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] text-slate-700"
              title={`${sugerencia.agregar} ${sugerencia.gana}`}
            >
              {sugerencia.agregar}{" "}
              <strong className="font-semibold text-rose-700">
                {sugerencia.gana}
              </strong>
            </p>
            {sugerencia.accion && (
              <button
                type="button"
                onClick={sugerencia.accion.onClick}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <Plus size={13} /> {sugerencia.accion.texto}
              </button>
            )}
            <button
              type="button"
              aria-label={`Descartar ${sugerencia.nombre}`}
              onClick={() => onDescartar(sugerencia.id)}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
