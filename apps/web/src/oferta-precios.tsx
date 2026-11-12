import { AlertTriangle, ArrowRight, Tag } from "lucide-react";
import type { CatalogProduct } from "./lib/api";
import type { OfertaEntrada } from "./lib/ofertas-api";
import {
  pesosAMinor,
  vistaPrevia,
  type DestinoFormulario,
} from "./lib/oferta-formulario";
import { pesos } from "./lib/ofertas-motor";

const MAXIMO_FILAS = 6;

const plata = (minor: number) => pesos(BigInt(Math.round(minor)));
const porcentajeAhorro = (bruto: number, final: number) =>
  bruto > 0 ? Math.round(((bruto - final) / bruto) * 100) : 0;

/**
 * Vista previa de la oferta (SISTEMA-103): el precio de lista de cada
 * producto elegido y cuánto queda con la oferta, mientras se completa. La
 * cuenta es la misma del motor que cobra; es sólo una vista previa.
 */
export function PreciosOferta({
  entrada,
  error,
  etiqueta,
  destinos,
  productosPorId,
  costos,
  precioEjemplo,
  onPrecioEjemplo,
}: {
  /** Null mientras los datos del descuento no están completos. */
  entrada: OfertaEntrada | null;
  error?: string;
  etiqueta?: string;
  destinos: DestinoFormulario[];
  productosPorId: Map<string, CatalogProduct>;
  costos?: Map<string, number>;
  precioEjemplo: string;
  onPrecioEjemplo: (valor: string) => void;
}) {
  const precioDe = (id: string) =>
    Number(productosPorId.get(id)?.prices[0]?.amountMinor ?? 0);
  const productos = destinos.filter(
    (destino) => destino.kind === "PRODUCT" && !destino.exclude,
  );
  const grupos = destinos.filter(
    (destino) => destino.kind !== "PRODUCT" && !destino.exclude,
  );
  const combo = entrada?.type === "BUNDLE" || destinos.some((d) => d.quantity);
  return (
    <section
      aria-label="Vista previa de precios"
      className="overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-b from-teal-50/70 to-white"
    >
      <header className="flex items-center gap-2 border-b border-teal-100 px-4 py-3">
        <Tag size={16} className="text-teal-700" />
        <p className="text-sm font-semibold text-slate-800">Cómo queda</p>
        {etiqueta && (
          <span className="ml-auto rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            {etiqueta}
          </span>
        )}
      </header>
      <div className="space-y-3 p-4">
        {!productos.length && !grupos.length ? (
          <p className="text-sm text-slate-500">
            Elegí productos para ver sus precios con la oferta.
          </p>
        ) : null}
        {combo && productos.length ? (
          <Combo entrada={entrada} productos={productos} precioDe={precioDe} />
        ) : (
          <ul className="space-y-2">
            {productos.slice(0, MAXIMO_FILAS).map((destino) => {
              const lista = precioDe(destino.id);
              const previa =
                entrada && lista ? vistaPrevia(entrada, lista) : null;
              const costo = costos?.get(destino.id);
              const debajo =
                previa && costo
                  ? previa.finalMinor / previa.cantidad < costo
                  : false;
              return (
                <li
                  key={destino.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <p className="truncate text-sm font-medium text-slate-800">
                    {destino.name}
                  </p>
                  {lista ? (
                    <Precio
                      lista={lista}
                      cantidad={previa?.cantidad ?? 1}
                      final={previa?.finalMinor}
                    />
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Sin precio en Precio general.
                    </p>
                  )}
                  {debajo && costo ? (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-800">
                      <AlertTriangle size={13} /> Queda debajo del costo (
                      {plata(costo)} c/u)
                    </p>
                  ) : null}
                </li>
              );
            })}
            {productos.length > MAXIMO_FILAS && (
              <li className="text-xs text-slate-500">
                y {productos.length - MAXIMO_FILAS} productos más
              </li>
            )}
          </ul>
        )}
        {grupos.length > 0 && !combo && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
            <p className="text-xs text-slate-500">
              Para {grupos.map((grupo) => grupo.name).join(", ")}, con un precio
              de ejemplo:
            </p>
            <label className="mt-2 flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-50">
              <span className="text-sm text-slate-400">$</span>
              <input
                aria-label="Precio de ejemplo"
                inputMode="decimal"
                className="h-full w-full min-w-0 border-0 bg-transparent px-2 text-sm outline-none"
                value={precioEjemplo}
                onChange={(event) => onPrecioEjemplo(event.target.value)}
              />
            </label>
            {(() => {
              const ejemplo = pesosAMinor(precioEjemplo) ?? 0;
              const previa =
                entrada && ejemplo ? vistaPrevia(entrada, ejemplo) : null;
              return ejemplo ? (
                <Precio
                  lista={ejemplo}
                  cantidad={previa?.cantidad ?? 1}
                  final={previa?.finalMinor}
                />
              ) : null;
            })()}
          </div>
        )}
        {error && (productos.length > 0 || grupos.length > 0) && (
          <p className="text-xs text-slate-500">{error}</p>
        )}
      </div>
    </section>
  );
}

function Precio({
  lista,
  cantidad,
  final,
}: {
  lista: number;
  cantidad: number;
  final?: number;
}) {
  const bruto = lista * cantidad;
  const conOferta = final !== undefined && final < bruto;
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
        <span className="text-xs text-slate-500">
          {cantidad > 1 ? `${cantidad} × ${plata(lista)}` : "Lista"}
        </span>
        <span
          className={
            conOferta ? "text-slate-400 line-through" : "font-semibold"
          }
        >
          {plata(bruto)}
        </span>
        {conOferta && (
          <>
            <ArrowRight size={13} className="self-center text-slate-400" />
            <span className="text-base font-bold text-teal-800">
              {plata(final)}
            </span>
            <span className="rounded bg-rose-50 px-1.5 text-xs font-semibold text-rose-700">
              −{porcentajeAhorro(bruto, final)}%
            </span>
          </>
        )}
      </div>
      {conOferta && cantidad > 1 && (
        <p className="text-xs text-slate-500">
          Sale {plata(final / cantidad)} cada uno
        </p>
      )}
      {!conOferta && final === undefined && (
        <p className="text-xs text-slate-400">
          Completá el descuento para ver el precio final.
        </p>
      )}
    </div>
  );
}

function Combo({
  entrada,
  productos,
  precioDe,
}: {
  entrada: OfertaEntrada | null;
  productos: DestinoFormulario[];
  precioDe: (id: string) => number;
}) {
  const filas = productos.map((destino) => ({
    destino,
    cantidad: Math.max(Number(destino.quantity) || 1, 1),
    precio: precioDe(destino.id),
  }));
  const bruto = filas.reduce(
    (suma, fila) => suma + fila.precio * fila.cantidad,
    0,
  );
  const previa =
    entrada && entrada.type === "BUNDLE"
      ? vistaPrevia(
          entrada,
          0,
          new Map(filas.map((fila) => [fila.destino.id, fila.precio])),
        )
      : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100 text-sm">
        {filas.map(({ destino, cantidad, precio }) => (
          <li key={destino.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">{destino.name}</span>
            <span className="whitespace-nowrap text-xs text-slate-500 tabular-nums">
              {cantidad} × {precio ? plata(precio) : "sin precio"}
            </span>
            <span className="w-24 text-right tabular-nums">
              {plata(precio * cantidad)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-slate-200 px-3 py-2.5 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt className="text-slate-500">Precio de lista del combo</dt>
          <dd
            className={previa ? "text-slate-400 line-through" : "font-semibold"}
          >
            {plata(bruto)}
          </dd>
        </div>
        {previa && (
          <>
            <div className="flex justify-between">
              <dt className="font-medium text-slate-700">Con la oferta</dt>
              <dd className="text-base font-bold text-teal-800">
                {plata(previa.finalMinor)}
              </dd>
            </div>
            <div className="flex justify-between text-rose-700">
              <dt>Ahorro</dt>
              <dd className="font-semibold">
                {plata(bruto - previa.finalMinor)} (−
                {porcentajeAhorro(bruto, previa.finalMinor)}%)
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
