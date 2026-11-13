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
          className="absolute bottom-full left-0 z-30 mb-2 w-[30rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Ofertas de esta venta
          </p>
          <TablaOfertasVenta
            aplicadas={aplicadas}
            quitadas={quitadas}
            onQuitar={onQuitar}
            onAplicar={onAplicar}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Las ofertas de la venta como tabla (SISTEMA-104): nombre, descuento que
 * aplica, ahorro y la acción; al pie, el total ahorrado. Las quitadas quedan
 * en gris, sin ahorro, con «Aplicar».
 */
export function TablaOfertasVenta({
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
  const totalMinor = aplicadas.reduce(
    (suma, oferta) => suma + (oferta.ahorroMinor ?? 0),
    0,
  );
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full table-fixed text-xs">
        <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-1.5 text-left font-semibold">
              Oferta
            </th>
            <th
              scope="col"
              className="w-36 px-2 py-1.5 text-left font-semibold"
            >
              Descuento
            </th>
            <th
              scope="col"
              className="w-24 px-2 py-1.5 text-right font-semibold"
            >
              Ahorro
            </th>
            <th scope="col" className="w-24 px-3 py-1.5">
              <span className="sr-only">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {aplicadas.map((oferta) => (
            <tr key={oferta.id}>
              <td
                className="truncate px-3 py-2 font-semibold text-slate-800"
                title={oferta.nombre}
              >
                {oferta.nombre}
              </td>
              <td className="px-2 py-2">
                <span
                  className="block truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700"
                  title={oferta.label}
                >
                  {oferta.label}
                </span>
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums text-rose-700">
                {oferta.ahorroMinor ? `−${money(oferta.ahorroMinor)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  aria-label={`Quitar la oferta ${oferta.nombre} de la venta`}
                  onClick={() => onQuitar(oferta.id)}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X size={12} aria-hidden />
                  <span className="text-[11px] font-semibold">Quitar</span>
                </button>
              </td>
            </tr>
          ))}
          {quitadas.map((oferta) => (
            <tr key={oferta.id} className="bg-slate-50/70 text-slate-500">
              <td className="truncate px-3 py-2" title={oferta.nombre}>
                {oferta.nombre}{" "}
                <span className="text-[11px] text-slate-400">· quitada</span>
              </td>
              <td className="px-2 py-2">
                <span
                  className="block truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold line-through"
                  title={oferta.label}
                >
                  {oferta.label}
                </span>
              </td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  aria-label={`Volver a aplicar la oferta ${oferta.nombre}`}
                  onClick={() => onAplicar(oferta.id)}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-teal-200 bg-white px-2 text-teal-700 hover:bg-teal-50"
                >
                  <RotateCcw size={12} aria-hidden />
                  <span className="text-[11px] font-semibold">Aplicar</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {aplicadas.length > 0 && (
          <tfoot className="border-t border-slate-200 bg-slate-50/70">
            <tr>
              <th
                scope="row"
                colSpan={2}
                className="px-3 py-2 text-left font-semibold text-slate-700"
              >
                Total ahorrado
              </th>
              <td className="px-2 py-2 text-right font-bold tabular-nums text-rose-700">
                −{money(totalMinor)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
