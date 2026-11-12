import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw, X } from "lucide-react";

const money = (minor: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    minor / 100,
  );

export type OfertaDeLaVenta = {
  id: string;
  label: string;
  nombre: string;
  /** Ahorro en la venta; las quitadas no lo tienen. */
  ahorroMinor?: number;
};

/**
 * Ofertas de la venta (SISTEMA-103), junto al ahorro del pie: lista las que se
 * aplican, con «Quitar» para sacar una de toda la venta, y las quitadas con
 * «Volver a aplicar». Los textos van en `span` con su tamaño porque la regla
 * global de `button` pisa el tamaño de letra de las utilidades.
 */
export function SaleOffersControl({
  aplicadas,
  quitadas,
  onQuitar,
  onAplicar,
}: {
  aplicadas: OfertaDeLaVenta[];
  quitadas: OfertaDeLaVenta[];
  onQuitar: (id: string) => void;
  onAplicar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node))
        setAbierto(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);
  if (!aplicadas.length && !quitadas.length) return null;
  return (
    <div ref={contenedor} className="relative">
      {/* El título del ahorro abre la lista: no suma ancho al pie. */}
      <button
        type="button"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={
          quitadas.length
            ? `Ver ofertas de la venta (${quitadas.length} quitada${quitadas.length === 1 ? "" : "s"})`
            : "Ver ofertas de la venta"
        }
        onClick={() => setAbierto((actual) => !actual)}
        className={`inline-flex items-center gap-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-teal-200 ${aplicadas.length ? "text-rose-700 hover:text-rose-800" : "text-slate-500 hover:text-slate-700"}`}
      >
        <span className="text-xs font-semibold underline-offset-2 hover:underline">
          {/* Sin ofertas aplicadas no hay ahorro que mostrar: sólo las quitadas. */}
          {aplicadas.length
            ? "Ahorro por ofertas"
            : `${quitadas.length} oferta${quitadas.length === 1 ? "" : "s"} quitada${quitadas.length === 1 ? "" : "s"}`}
        </span>
        <span className="relative">
          <ChevronDown size={13} aria-hidden />
          {quitadas.length > 0 && aplicadas.length > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-slate-400"
            />
          )}
        </span>
      </button>
      {abierto && (
        <div
          role="dialog"
          aria-label="Ofertas de la venta"
          className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Ofertas de esta venta
          </p>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {aplicadas.map((oferta) => (
              <li key={oferta.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
                    {oferta.label}
                  </span>
                  <p className="truncate text-xs text-slate-600">
                    {oferta.nombre}
                  </p>
                </div>
                {oferta.ahorroMinor ? (
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-rose-700">
                    −{money(oferta.ahorroMinor)}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Quitar la oferta ${oferta.nombre} de la venta`}
                  onClick={() => onQuitar(oferta.id)}
                  className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X size={12} aria-hidden />
                  <span className="text-[11px] font-semibold">Quitar</span>
                </button>
              </li>
            ))}
            {quitadas.map((oferta) => (
              <li
                key={oferta.id}
                className="flex items-center gap-2 bg-slate-50/70 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 line-through">
                    {oferta.label}
                  </span>
                  <p className="truncate text-xs text-slate-500">
                    {oferta.nombre} · quitada
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Volver a aplicar la oferta ${oferta.nombre}`}
                  onClick={() => onAplicar(oferta.id)}
                  className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-teal-200 bg-white px-2 text-teal-700 hover:bg-teal-50"
                >
                  <RotateCcw size={12} aria-hidden />
                  <span className="text-[11px] font-semibold">
                    Volver a aplicar
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
