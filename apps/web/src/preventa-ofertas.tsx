import { useEffect, useState } from "react";
import { BadgePercent, CalendarClock, Check, Sparkles } from "lucide-react";

import { preventaApi, type OfertaVigente } from "./lib/preventa-api";
import { fecha, mensajeDe, pesos } from "./lib/preventa";
import { Aviso, Hoja, Pastilla, Vacio } from "./preventa-ui";

/**
 * Ofertas vigentes para el preventista (SISTEMA-108): las de mostrador, que
 * también valen en sus pedidos. Se cargan en Ofertas de la gestión; acá se
 * consultan para ofrecerlas en la calle.
 */
export function PreventaOfertas({
  token,
  organizationId,
}: {
  token: string;
  organizationId: string;
}) {
  const [ofertas, setOfertas] = useState<OfertaVigente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<OfertaVigente | null>(null);
  useEffect(() => {
    preventaApi
      .ofertas(token, organizationId)
      .then((lista) => (setOfertas(lista), setError("")))
      .catch((causa) => setError(mensajeDe(causa)))
      .finally(() => setCargando(false));
  }, [token, organizationId]);

  return (
    <div className="grid gap-3">
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!cargando && !ofertas.length && !error ? (
        <Vacio
          icono={<BadgePercent size={22} aria-hidden />}
          titulo="No hay ofertas vigentes"
          detalle="Las ofertas se cargan en Ofertas de la gestión y se aplican solas a los pedidos."
        />
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ofertas.map((oferta) => (
          <li key={oferta.id}>
            <button
              type="button"
              onClick={() => setAbierta(oferta)}
              className="flex h-full w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-amber-300"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <BadgePercent size={20} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {oferta.name}
                  </span>
                  {!oferta.vigenteAhora ? (
                    <Pastilla tono="neutro">Otro día</Pastilla>
                  ) : null}
                </span>
                <span className="block text-base font-bold text-amber-800">
                  {oferta.label}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {oferta.alcance.slice(0, 3).join(", ") || "Ver productos"}
                  {oferta.alcance.length > 3
                    ? ` y ${oferta.alcance.length - 3} más`
                    : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {abierta ? (
        <Hoja titulo={abierta.name} onClose={() => setAbierta(null)}>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3">
              <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <Sparkles size={20} aria-hidden />
              </span>
              <p className="text-xl font-bold text-amber-900">
                {abierta.label}
              </p>
            </div>
            <ul className="grid gap-1.5">
              {abierta.detalle.map((linea) => (
                <li
                  key={linea}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <Check
                    size={16}
                    className="mt-0.5 text-teal-700"
                    aria-hidden
                  />
                  {linea}
                </li>
              ))}
              {abierta.minimoMinor ? (
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <Check
                    size={16}
                    className="mt-0.5 text-teal-700"
                    aria-hidden
                  />
                  Comprando desde {pesos(abierta.minimoMinor)}
                </li>
              ) : null}
            </ul>
            {abierta.alcance.length ? (
              <section>
                <h3 className="text-sm font-bold text-slate-800">Vale para</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {abierta.alcance.map((nombre) => (
                    <li
                      key={nombre}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {nombre}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {abierta.endsAt ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarClock size={14} aria-hidden /> Hasta el{" "}
                {fecha(abierta.endsAt)}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Se aplica sola al confirmar el pedido si se cumplen las
              condiciones.
            </p>
          </div>
        </Hoja>
      ) : null}
    </div>
  );
}
