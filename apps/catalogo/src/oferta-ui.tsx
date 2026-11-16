import { BadgePercent } from "lucide-react";

import type { OfertaDelProducto } from "./lib/api";
import { pesos } from "./lib/carrito";

/** Píldora de la oferta: corta y con ícono ("-15%", "3x2", "Llevando 2: -5%"). */
export function PildoraOferta({
  oferta,
  chica = false,
}: {
  oferta: Pick<OfertaDelProducto, "corta">;
  chica?: boolean;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-2xl text-left leading-tight bg-rose-100 font-bold text-rose-700 shadow-sm ring-1 ring-rose-200 ${
        chica ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <BadgePercent size={chica ? 13 : 15} className="shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{oferta.corta}</span>
    </span>
  );
}

/**
 * Precio con la oferta: si vale desde 1 unidad, el de lista tachado y el
 * nuevo; si es por cantidad, cuánto sale cada una llevando esa cantidad.
 */
export function PrecioConOferta({
  priceMinor,
  oferta,
  grande = false,
}: {
  priceMinor: string | null;
  oferta: OfertaDelProducto | undefined;
  grande?: boolean;
}) {
  if (priceMinor === null) return null;
  const tamano = grande ? "text-3xl" : "text-lg";
  if (oferta?.precioOfertaMinor)
    return (
      <div className="leading-tight">
        <p
          className={`text-slate-400 line-through ${grande ? "text-base" : "text-xs"}`}
        >
          {pesos(priceMinor)}
        </p>
        <p className={`${tamano} font-bold tabular-nums text-rose-700`}>
          {pesos(oferta.precioOfertaMinor)}
        </p>
      </div>
    );
  return (
    <div className="leading-tight">
      <p className={`${tamano} font-bold tabular-nums text-slate-900`}>
        {pesos(priceMinor)}
      </p>
      {oferta?.porCantidad ? (
        <p
          className={`font-semibold text-rose-700 ${grande ? "text-sm" : "text-xs"}`}
        >
          Llevando {oferta.porCantidad.cantidad}:{" "}
          {pesos(oferta.porCantidad.precioUnitarioMinor)} c/u
        </p>
      ) : null}
    </div>
  );
}
