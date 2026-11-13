import { useEffect, useRef, useState } from "react";
import {
  BadgePercent,
  Check,
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

/** Una oferta que ya se cumple en el carrito (SISTEMA-104). */
export type OfertaAplicadaCarrito = {
  id: string;
  label: string;
  nombre: string;
  ahorroMinor: number;
};

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

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
  aplicadas = [],
}: {
  aviso?: string;
  onCerrarAviso: () => void;
  sugerencias: SugerenciaCarrito[];
  onDescartar: (id: string) => void;
  /**
   * Ofertas que ya se cumplen: quedan en el pasador, con ✓ y el mismo estilo, después de las
   * sugerencias, así cumplir una no lo hace desaparecer (SISTEMA-104).
   */
  aplicadas?: OfertaAplicadaCarrito[];
}) {
  const [indice, setIndice] = useState(0);
  const inicioAplicadas = (aviso ? 1 : 0) + sugerencias.length;
  const total = inicioAplicadas + aplicadas.length;
  // Cuando una sugerencia se cumple, el pasador muestra su versión aplicada.
  const sugeridasAntes = useRef<string[]>([]);
  const claveSugeridas = sugerencias.map((item) => item.id).join("|");
  const claveAplicadas = aplicadas.map((item) => item.id).join("|");
  useEffect(() => {
    const cumplida = aplicadas.findIndex(
      (item) =>
        sugeridasAntes.current.includes(item.id) &&
        !sugerencias.some((sugerida) => sugerida.id === item.id),
    );
    if (cumplida >= 0) setIndice(inicioAplicadas + cumplida);
    sugeridasAntes.current = sugerencias.map((item) => item.id);
  }, [claveSugeridas, claveAplicadas]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!total) return null;
  const actual = Math.min(indice, total - 1);
  const esAviso = Boolean(aviso) && actual === 0;
  const aplicada =
    actual >= inicioAplicadas ? aplicadas[actual - inicioAplicadas] : undefined;
  const sugerencia =
    esAviso || aplicada ? undefined : sugerencias[actual - (aviso ? 1 : 0)];
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
        ) : aplicada ? (
          <>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
              <Check size={11} aria-hidden />
              {aplicada.label}
            </span>
            <p
              role="status"
              className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] text-slate-700"
              title={`Oferta aplicada: ${aplicada.nombre}`}
            >
              Oferta aplicada{" "}
              <strong className="font-semibold text-rose-700">
                «{aplicada.nombre}»: ahorrás {money(aplicada.ahorroMinor)}
              </strong>
            </p>
            {/* Lugar de la ✕ de las sugerencias: mismo ancho de texto. */}
            <span aria-hidden className="size-[22px] shrink-0" />
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
      {/* Con una sola tarjeta las flechas no se muestran, pero su lugar queda
          reservado para que el recuadro no cambie de ancho (SISTEMA-104). */}
      {total <= 1 && <span aria-hidden className="w-[96px] shrink-0" />}
      {total > 1 && (
        <div className="flex w-[96px] shrink-0 items-center gap-0.5 text-xs tabular-nums text-slate-500">
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
