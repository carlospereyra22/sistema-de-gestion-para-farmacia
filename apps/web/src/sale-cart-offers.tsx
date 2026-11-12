import { useState } from "react";
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  Info,
  Package,
  Plus,
  X,
} from "lucide-react";

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
 * Ofertas del carrito de Ventas (SISTEMA-103) en un pasador de alto fijo: se
 * ve una por vez (el aviso de cambios o una oferta para completar) y las
 * flechas pasan a las demás. Ocupa siempre lo mismo, haya una o muchas.
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
  const [indice, setIndice] = useState(0);
  const total = (aviso ? 1 : 0) + sugerencias.length;
  if (!total) return null;
  const actual = Math.min(indice, total - 1);
  const esAviso = Boolean(aviso) && actual === 0;
  const sugerencia = esAviso
    ? undefined
    : sugerencias[actual - (aviso ? 1 : 0)];
  return (
    <section
      aria-label="Ofertas de la venta"
      aria-roledescription="pasador"
      className="sale-cart-offers flex h-[60px] shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-5"
    >
      <div
        className={`flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 ${esAviso ? "bg-amber-50" : "bg-rose-50/60"}`}
      >
        {esAviso ? (
          <>
            <Info size={15} className="shrink-0 text-amber-700" />
            <p
              role="status"
              className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-[18px] text-amber-900"
            >
              {aviso}
            </p>
            <button
              type="button"
              aria-label="Cerrar aviso de ofertas"
              onClick={onCerrarAviso}
              className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100"
            >
              <X size={14} />
            </button>
          </>
        ) : sugerencia ? (
          <>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
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
          </>
        ) : null}
      </div>
      {total > 1 && (
        <div className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-slate-500">
          <button
            type="button"
            aria-label="Oferta anterior"
            disabled={actual <= 0}
            onClick={() => setIndice(actual - 1)}
            className="grid size-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="w-9 text-center">
            {actual + 1}/{total}
          </span>
          <button
            type="button"
            aria-label="Oferta siguiente"
            disabled={actual >= total - 1}
            onClick={() => setIndice(actual + 1)}
            className="grid size-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
