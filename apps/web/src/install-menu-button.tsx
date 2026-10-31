import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { pwaInstall } from "./lib/pwa-install";

export function InstallMenuButton({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const available = useSyncExternalStore(
    pwaInstall.subscribe,
    pwaInstall.getSnapshot,
    () => false,
  );
  if (!available) return null;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 outline-none hover:bg-teal-50 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600"
      onClick={() => {
        void pwaInstall
          .install()
          .then(onDone)
          .catch(() =>
            onError(
              "No se pudo abrir la instalación. Podés intentarlo desde el menú de Chrome o Edge.",
            ),
          );
      }}
    >
      <Download size={17} aria-hidden="true" />
      Instalar sistema
    </button>
  );
}
