import { useState } from "react";
import { WifiOff } from "lucide-react";
import { avisoConexion } from "./lib/aviso-conexion";
import {
  TOKEN_SIN_CONEXION,
  horaUltimaSincronizacion,
} from "./lib/cache-local";
import { useConectividad } from "./lib/conectividad";

/** Aviso del encabezado cuando no hay conexión con el servidor. */
export function ConexionChip({ token }: { token?: string }) {
  const { enLinea } = useConectividad();
  const [open, setOpen] = useState(false);
  const aviso = avisoConexion({
    enLinea,
    sinSesion: token === TOKEN_SIN_CONEXION,
    ultimaSincronizacion: horaUltimaSincronizacion(),
  });
  if (!aviso) return null;
  return (
    <div className="relative" role="status">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 text-amber-800"
      >
        <WifiOff size={13} aria-hidden="true" />
        <span className="text-xs font-semibold">{aviso.etiqueta}</span>
      </button>
      {open && (
        <div className="fixed inset-x-4 top-[90px] z-50 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-[0_12px_40px_rgb(15_23_42_/_16%)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <p>{aviso.texto}</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
