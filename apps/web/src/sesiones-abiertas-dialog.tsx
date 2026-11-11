import { useEffect, useState, type ReactElement } from "react";
import { LogOut, Monitor, MonitorCheck } from "lucide-react";
import type { SesionAbierta } from "./lib/api";
import { sesionesParaMostrar } from "./lib/sesiones-abiertas";
import { OperationConfirmDialog } from "./operation-confirm-dialog";
import { StatusToast } from "./status-toast";
import { PayableDialog, secondary } from "./supplier-payables/dialog";

/** Lista de sesiones, sin estado: la usa el diálogo y se prueba aparte. */
export function ListaDeSesiones({
  sesiones,
  idDeEstaPc,
  ahora,
  onCerrar,
}: {
  sesiones: readonly SesionAbierta[];
  idDeEstaPc?: string;
  ahora: number;
  onCerrar: (sesion: { id: string; titulo: string }) => void;
}): ReactElement {
  const filas = sesionesParaMostrar(sesiones, idDeEstaPc, ahora);
  if (!filas.length)
    return (
      <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
        No hay sesiones abiertas.
      </p>
    );
  return (
    <ul className="space-y-2">
      {filas.map((fila) => (
        <li
          key={fila.id}
          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${fila.estaPc ? "border-teal-200 bg-teal-50/50" : "border-slate-200 bg-white"}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
            {fila.estaPc ? (
              <MonitorCheck size={18} aria-hidden="true" />
            ) : (
              <Monitor size={18} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
              {fila.titulo}
              {fila.estaPc && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                  Esta PC
                </span>
              )}
            </span>
            <span className="block text-xs break-words text-slate-500">
              {fila.detalle}
            </span>
          </span>
          {!fila.actual && (
            <button
              type="button"
              className={`${secondary} shrink-0`}
              aria-label={`Cerrar la sesión de ${fila.titulo}`}
              onClick={() => onCerrar({ id: fila.id, titulo: fila.titulo })}
            >
              <LogOut size={15} aria-hidden="true" />
              Cerrar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Sesiones abiertas" (SISTEMA-93): las propias desde el menú de la cuenta o
 * las de un usuario desde Administración. Confirma antes de cerrar y avisa al
 * terminar. Lo hecho sin conexión en esa PC no se pierde: se sincroniza
 * cuando su dueño vuelve a entrar.
 */
export function SesionesAbiertasDialog({
  titulo,
  subtitulo,
  idDeEstaPc,
  textoCerrarTodas,
  cargar,
  cerrarUna,
  cerrarTodas,
  onClose,
}: {
  titulo: string;
  subtitulo: string;
  idDeEstaPc?: string;
  textoCerrarTodas: string;
  cargar: () => Promise<SesionAbierta[]>;
  cerrarUna: (id: string) => Promise<unknown>;
  cerrarTodas: () => Promise<{ cerradas: number }>;
  onClose: () => void;
}): ReactElement {
  const [sesiones, setSesiones] = useState<SesionAbierta[]>();
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [vuelta, setVuelta] = useState(0);
  const [confirmar, setConfirmar] = useState<
    { tipo: "una"; id: string; titulo: string } | { tipo: "todas" }
  >();
  useEffect(() => {
    let vigente = true;
    cargar()
      .then((lista) => {
        if (vigente) setSesiones(lista);
      })
      .catch((cause: unknown) => {
        if (vigente)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron ver las sesiones.",
          );
      });
    return () => {
      vigente = false;
    };
    // Se vuelve a cargar después de cerrar alguna.
  }, [cargar, vuelta]);
  const cerrables = sesiones?.filter(({ actual }) => !actual).length ?? 0;
  return (
    <PayableDialog title={titulo} onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-slate-500">{subtitulo}</p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {sesiones ? (
        <ListaDeSesiones
          sesiones={sesiones}
          idDeEstaPc={idDeEstaPc}
          ahora={Date.now()}
          onCerrar={(sesion) => setConfirmar({ tipo: "una", ...sesion })}
        />
      ) : (
        !error && <p className="text-sm text-slate-500">Cargando sesiones…</p>
      )}
      <footer className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} onClick={onClose}>
          Volver
        </button>
        {cerrables > 0 && (
          <button
            type="button"
            className={`${secondary} border-rose-200 text-rose-700 hover:bg-rose-50`}
            onClick={() => setConfirmar({ tipo: "todas" })}
          >
            <LogOut size={15} aria-hidden="true" />
            {textoCerrarTodas}
          </button>
        )}
      </footer>
      {confirmar && (
        <OperationConfirmDialog
          title={
            confirmar.tipo === "una" ? "Cerrar la sesión" : textoCerrarTodas
          }
          description={
            confirmar.tipo === "una"
              ? `Se cierra la sesión de ${confirmar.titulo}: para volver a usar el sistema en esa PC hay que entrar con la contraseña. Lo que se hizo sin conexión ahí no se pierde.`
              : `Se cierran ${cerrables} ${cerrables === 1 ? "sesión" : "sesiones"}: para volver a usar el sistema en esas PC hay que entrar con la contraseña. Lo que se hizo sin conexión ahí no se pierde.`
          }
          onConfirm={async () => {
            if (confirmar.tipo === "una") {
              await cerrarUna(confirmar.id);
              setAviso(`Cerraste la sesión de ${confirmar.titulo}.`);
            } else {
              const { cerradas } = await cerrarTodas();
              setAviso(
                cerradas === 1
                  ? "Cerraste 1 sesión."
                  : `Cerraste ${cerradas} sesiones.`,
              );
            }
            setVuelta((valor) => valor + 1);
          }}
          onClose={() => setConfirmar(undefined)}
        />
      )}
      {aviso && (
        <StatusToast
          variant="success"
          message={aviso}
          onClose={() => setAviso("")}
        />
      )}
    </PayableDialog>
  );
}
