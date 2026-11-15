import { Moon, Sun } from "lucide-react";
import type { Tema } from "./lib/tema";

// Fila del menú de la cuenta para pasar de modo claro a oscuro. No cierra el
// menú: el cambio se ve en el momento y se puede volver atrás con otro clic.
export function TemaSwitch({
  tema,
  onChange,
}: {
  tema: Tema;
  onChange: (tema: Tema) => void;
}) {
  const oscuro = tema === "oscuro";
  const Icono = oscuro ? Moon : Sun;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={oscuro}
      title={oscuro ? "Volver al modo claro" : "Usar el modo oscuro"}
      onClick={() => onChange(oscuro ? "claro" : "oscuro")}
      className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      <Icono size={17} className="shrink-0" aria-hidden="true" />
      <span className="flex-1">Modo oscuro</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          oscuro ? "bg-teal-600" : "bg-slate-300 group-hover:bg-slate-400"
        }`}
      >
        <span
          className={`absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
            oscuro ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
