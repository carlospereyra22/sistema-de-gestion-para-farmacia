import { useState } from "react";
import { Puzzle, Store } from "lucide-react";

import { updatePlatformModules } from "./lib/platform-api";
import { PlatformPanel } from "./platform-ui";

/**
 * Módulos que se contratan aparte (SISTEMA-107). Hoy, el catálogo online: con
 * él la farmacia tiene su página para clientes, los pedidos y las ofertas de
 * catálogo. Apagado no se borra nada: vuelve como estaba al prenderlo.
 */
export function PlatformModulos({
  token,
  organizationId,
  catalogEnabled,
  onChanged,
  onError,
}: {
  token: string;
  organizationId: string;
  catalogEnabled: boolean;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const cambiar = async () => {
    setGuardando(true);
    try {
      const { catalogEnabled: ahora } = await updatePlatformModules(
        token,
        organizationId,
        { catalogEnabled: !catalogEnabled },
      );
      onChanged(
        ahora
          ? "Catálogo online habilitado."
          : "Catálogo online deshabilitado. No se borró nada de lo cargado.",
      );
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <PlatformPanel
      icon={<Puzzle size={16} />}
      title="Módulos"
      description="Funciones que se contratan aparte del abono."
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-marca-970 text-marca-535">
            <Store size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              Catálogo online
            </p>
            <p className="text-xs text-slate-500">
              Página para que sus clientes pidan, pedidos y ofertas del
              catálogo. Al apagarlo no se borra nada.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={catalogEnabled}
          aria-label="Catálogo online"
          disabled={guardando}
          onClick={() => void cambiar()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            catalogEnabled ? "bg-teal-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
              catalogEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </PlatformPanel>
  );
}
