import type { OfertaDeVentaRegistrada } from "./lib/api";

const money = (minor: string | number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(minor) / 100,
  );

/**
 * Contenido del globo del ahorro en el detalle de una venta (SISTEMA-104):
 * qué ofertas se aplicaron, su etiqueta, a cuántos productos y cuánto.
 */
export function OfertasDeVentaDetalle({
  offers,
}: {
  offers: readonly OfertaDeVentaRegistrada[];
}) {
  const total = offers.reduce(
    (suma, offer) => suma + Number(offer.discountMinor),
    0,
  );
  return (
    <>
      <p className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">
        Ofertas aplicadas
      </p>
      <ul className="divide-y divide-slate-100">
        {offers.map((offer) => (
          <li key={offer.offerId} className="px-3 py-2">
            <div className="flex items-baseline gap-3">
              <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                {offer.name}
              </p>
              <span className="shrink-0 font-semibold tabular-nums text-rose-700">
                −{money(offer.discountMinor)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
                {offer.label}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">
                {offer.items.length} producto
                {offer.items.length === 1 ? "" : "s"} · {offer.units} u.
              </span>
            </div>
          </li>
        ))}
      </ul>
      {offers.length > 1 && (
        <p className="flex justify-between border-t border-slate-100 px-3 py-2 font-semibold text-slate-700">
          <span>Total ahorrado</span>
          <span className="tabular-nums text-rose-700">−{money(total)}</span>
        </p>
      )}
    </>
  );
}

/**
 * Globo de la columna «Ahorro» del historial (SISTEMA-104): las ofertas que
 * se aplicaron y el descuento manual, si hubo.
 */
export function AhorroDeVentaDetalle({
  offers,
  ofertasMinor,
  descuentoMinor,
}: {
  offers: readonly OfertaDeVentaRegistrada[];
  ofertasMinor: number;
  descuentoMinor: number;
}) {
  return (
    <>
      {offers.length ? (
        <OfertasDeVentaDetalle offers={offers} />
      ) : ofertasMinor > 0 ? (
        <p className="flex justify-between gap-3 px-3 py-2 text-slate-700">
          <span>Ofertas</span>
          <span className="font-semibold tabular-nums text-rose-700">
            −{money(ofertasMinor)}
          </span>
        </p>
      ) : null}
      {descuentoMinor > 0 && (
        <p className="flex justify-between gap-3 border-t border-slate-100 px-3 py-2 text-slate-700 first:border-t-0">
          <span>Descuento</span>
          <span className="font-semibold tabular-nums text-rose-700">
            −{money(descuentoMinor)}
          </span>
        </p>
      )}
    </>
  );
}

/**
 * Contenido del globo de un renglón: precio de lista, la oferta que lo tocó,
 * el descuento manual si hubo y lo que se cobró (SISTEMA-104).
 */
export function DescuentoDeRenglonDetalle({
  ofertas,
  subtotalMinor,
  ofertasMinor,
  descuentoMinor,
  totalMinor,
}: {
  ofertas: readonly { name: string; label: string }[];
  subtotalMinor: number;
  ofertasMinor: number;
  descuentoMinor: number;
  totalMinor: number;
}) {
  return (
    <dl className="space-y-1.5 px-3 py-2.5">
      <div className="flex justify-between gap-3 text-slate-600">
        <dt>Precio de lista</dt>
        <dd className="tabular-nums">{money(subtotalMinor)}</dd>
      </div>
      {ofertasMinor > 0 && (
        <div className="flex items-start justify-between gap-3">
          <dt className="min-w-0">
            {ofertas.length ? (
              ofertas.map((oferta) => (
                <span key={oferta.label} className="block">
                  <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
                    {oferta.label}
                  </span>{" "}
                  <span className="text-slate-600">{oferta.name}</span>
                </span>
              ))
            ) : (
              <span className="text-slate-600">Oferta</span>
            )}
          </dt>
          <dd className="shrink-0 font-semibold tabular-nums text-rose-700">
            −{money(ofertasMinor)}
          </dd>
        </div>
      )}
      {descuentoMinor > 0 && (
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Descuento</dt>
          <dd className="font-semibold tabular-nums text-rose-700">
            −{money(descuentoMinor)}
          </dd>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5 font-semibold text-slate-800">
        <dt>Cobrado</dt>
        <dd className="tabular-nums">{money(totalMinor)}</dd>
      </div>
    </dl>
  );
}
