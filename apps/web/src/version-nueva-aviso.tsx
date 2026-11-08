import { RefreshCw } from "lucide-react";
import { actualizarAhora, useVersionNueva } from "./lib/version-nueva";

/** Aviso fijo cuando hay una versión nueva; actualiza sólo si se toca. */
export function VersionNuevaAviso() {
  const disponible = useVersionNueva();
  if (!disponible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-teal-200 bg-white p-3 text-sm text-slate-700 shadow-[0_12px_40px_rgb(15_23_42_/_16%)]"
    >
      <p>
        Hay una versión nueva del sistema. Terminá la venta en curso y
        actualizá.
      </p>
      <button
        type="button"
        onClick={actualizarAhora}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white"
      >
        <RefreshCw size={14} aria-hidden="true" />
        Actualizar
      </button>
    </div>
  );
}
