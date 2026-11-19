import { useState } from "react";
import { Puzzle, Route, Store } from "lucide-react";

import { updatePlatformModules } from "./lib/platform-api";
import { PlatformPanel } from "./platform-ui";

type Modulo = "catalogEnabled" | "preventaEnabled";

const MODULOS: {
  clave: Modulo;
  nombre: string;
  detalle: string;
  icono: typeof Store;
}[] = [
  {
    clave: "catalogEnabled",
    nombre: "Catálogo online",
    detalle:
      "Página para que sus clientes pidan, pedidos y ofertas del catálogo. Al apagarlo no se borra nada.",
    icono: Store,
  },
  {
    clave: "preventaEnabled",
    nombre: "Preventa",
    detalle:
      "Pedidos de preventistas desde el celular, reparto con mapa, cobros y comisiones. Al prenderlo se crean los roles Preventista y Repartidor.",
    icono: Route,
  },
];

/**
 * Módulos que se contratan aparte (catálogo online SISTEMA-107, preventa
 * SISTEMA-108). Apagado no se borra nada: vuelve como estaba al prenderlo.
 */
export function PlatformModulos({
  token,
  organizationId,
  catalogEnabled,
  preventaEnabled = false,
  onChanged,
  onError,
}: {
  token: string;
  organizationId: string;
  catalogEnabled: boolean;
  preventaEnabled?: boolean;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [guardando, setGuardando] = useState<Modulo | null>(null);
  const estado: Record<Modulo, boolean> = { catalogEnabled, preventaEnabled };
  const cambiar = async (clave: Modulo, nombre: string) => {
    setGuardando(clave);
    try {
      const respuesta = await updatePlatformModules(token, organizationId, {
        [clave]: !estado[clave],
      });
      onChanged(
        respuesta[clave]
          ? `${nombre} habilitado.`
          : `${nombre} deshabilitado. No se borró nada de lo cargado.`,
      );
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGuardando(null);
    }
  };
  return (
    <PlatformPanel
      icon={<Puzzle size={16} />}
      title="Módulos"
      description="Funciones que se contratan aparte del abono."
    >
      <ul className="divide-y divide-slate-100">
        {MODULOS.map(({ clave, nombre, detalle, icono: Icono }) => (
          <li
            key={clave}
            className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-marca-970 text-marca-535">
                <Icono size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{nombre}</p>
                <p className="text-xs text-slate-500">{detalle}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={estado[clave]}
              aria-label={nombre}
              disabled={guardando !== null}
              onClick={() => void cambiar(clave, nombre)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                estado[clave] ? "bg-teal-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                  estado[clave] ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </PlatformPanel>
  );
}
