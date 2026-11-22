import { useState } from "react";
import { Inbox, Route, Store } from "lucide-react";

import { cambiarVistaPedidos } from "./lib/pedidos-api";
import { mensajeDe } from "./lib/preventa";

/**
 * Cómo ve la farmacia los pedidos (SISTEMA-119): cada uno en su módulo o los
 * del catálogo online y los de preventa juntos en la pantalla Pedidos. Sólo
 * aparece con los dos módulos habilitados.
 */
export function OrganizacionVistaPedidos({
  token,
  organizationId,
  unificados,
  puedeCambiar,
  onCambio,
}: {
  token: string;
  organizationId: string;
  unificados: boolean;
  /** ORGANIZATION_MANAGE. */
  puedeCambiar: boolean;
  onCambio: (unificados: boolean) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "bien" | "error";
    texto: string;
  }>();

  const cambiar = async () => {
    setGuardando(true);
    setMensaje(undefined);
    try {
      const { unifiedOrders } = await cambiarVistaPedidos(
        token,
        organizationId,
        !unificados,
      );
      onCambio(unifiedOrders);
      setMensaje({
        tipo: "bien",
        texto: unifiedOrders
          ? "Listo: los pedidos están en Pedidos, en el menú."
          : "Listo: cada pedido se ve otra vez en su módulo.",
      });
    } catch (causa) {
      setMensaje({ tipo: "error", texto: mensajeDe(causa) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-marca-970 text-marca-535">
          <Inbox size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Pedidos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tenés Catálogo online y Preventa. Elegí si querés ver sus pedidos en
            una sola pantalla o cada uno en su módulo.
          </p>
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-niebla-973 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                Ver los pedidos juntos
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {unificados
                  ? "Los ves en Pedidos, en el menú. Catálogo online y Preventa ya no muestran su pestaña Pedidos; la versión celular de preventa no cambia."
                  : "Ahora cada módulo muestra sus pedidos. Al prenderlo aparece Pedidos en el menú, con los dos juntos."}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Store size={14} className="text-teal-600" aria-hidden />
                  Catálogo online
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Route size={14} className="text-sky-600" aria-hidden />
                  Preventa
                </span>
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unificados}
              aria-label="Ver los pedidos juntos"
              disabled={!puedeCambiar || guardando}
              onClick={() => void cambiar()}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                unificados ? "bg-teal-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                  unificados ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {!puedeCambiar ? (
            <p className="mt-2 text-xs text-slate-500">
              Lo cambia quien administra la farmacia.
            </p>
          ) : null}
          {mensaje ? (
            <p
              role={mensaje.tipo === "error" ? "alert" : "status"}
              className={`mt-2 text-sm ${mensaje.tipo === "error" ? "text-rose-700" : "text-emerald-700"}`}
            >
              {mensaje.texto}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
