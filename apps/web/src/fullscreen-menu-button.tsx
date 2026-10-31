import { useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize } from "lucide-react";
import {
  isFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from "./lib/fullscreen";

export function FullscreenMenuButton({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const active = useSyncExternalStore(
    subscribeFullscreen,
    isFullscreen,
    () => false,
  );
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const Icon = active ? Minimize : Maximize;
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={active}
      title={
        active ? "Salir de pantalla completa" : "Usar en pantalla completa"
      }
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        try {
          await toggleFullscreen();
          onDone();
        } catch {
          onError(
            !document.fullscreenEnabled
              ? "Este navegador no permite usar pantalla completa desde la aplicación."
              : "No se pudo cambiar el modo de pantalla. Intentá nuevamente desde este menú.",
          );
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 outline-none hover:bg-teal-50 hover:text-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
    >
      <Icon size={17} className="shrink-0" aria-hidden="true" />
      <span>{active ? "Vista normal" : "Pantalla completa"}</span>
    </button>
  );
}
