import { useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  CirclePause,
  CirclePlay,
  CircleStop,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AccionOferta, Oferta } from "./lib/ofertas-api";

type AccionConfirmada = Exclude<AccionOferta, "duplicar">;

const ACCIONES: Record<
  AccionConfirmada,
  {
    titulo: string;
    boton: string;
    icono: LucideIcon;
    tono: "teal" | "amber" | "rose" | "slate";
    texto: string;
    detalle: string;
  }
> = {
  publicar: {
    titulo: "Publicar oferta",
    boton: "Publicar",
    icono: Send,
    tono: "teal",
    texto: "La oferta se aplica sola en Ventas mientras esté vigente.",
    detalle:
      "Si su inicio es futuro, queda programada y empieza sola a esa hora.",
  },
  pausar: {
    titulo: "Pausar oferta",
    boton: "Pausar",
    icono: CirclePause,
    tono: "amber",
    texto: "Deja de aplicarse en Ventas hasta que la reanudes.",
    detalle:
      "Las ventas ya hechas no cambian. Un carrito en curso se actualiza y la cajera ve el aviso.",
  },
  reanudar: {
    titulo: "Reanudar oferta",
    boton: "Reanudar",
    icono: CirclePlay,
    tono: "teal",
    texto: "Vuelve a aplicarse en Ventas según su vigencia, días y horario.",
    detalle: "Se mantienen los topes y lo ya vendido con la oferta.",
  },
  finalizar: {
    titulo: "Finalizar oferta",
    boton: "Finalizar ya",
    icono: CircleStop,
    tono: "rose",
    texto: "Deja de aplicarse ahora y no se puede reanudar.",
    detalle:
      "Las ventas, tickets y facturas ya hechas no cambian. Para volver a usarla, duplicala.",
  },
  archivar: {
    titulo: "Archivar oferta",
    boton: "Archivar",
    icono: Archive,
    tono: "slate",
    texto: "Deja de aplicarse y sale del listado habitual.",
    detalle:
      "No se borra: sus ventas y su historial se conservan. La ves filtrando por «Archivada».",
  },
};

const TONOS = {
  teal: {
    icono: "bg-teal-50 text-teal-700",
    boton: "bg-teal-700 hover:bg-teal-800",
  },
  amber: {
    icono: "bg-amber-50 text-amber-700",
    boton: "bg-amber-600 hover:bg-amber-700",
  },
  rose: {
    icono: "bg-rose-50 text-rose-700",
    boton: "bg-rose-600 hover:bg-rose-700",
  },
  slate: {
    icono: "bg-slate-100 text-slate-700",
    boton: "bg-slate-700 hover:bg-slate-800",
  },
} as const;

/** Confirmación de una acción sobre una oferta, con el estilo del sistema. */
export function OfertaAccionDialog({
  oferta,
  accion,
  onConfirm,
  onClose,
}: {
  oferta: Pick<Oferta, "name" | "label">;
  accion: AccionConfirmada;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pendiente = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const datos = ACCIONES[accion];
  const tono = TONOS[datos.tono];
  const Icono = datos.icono;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const confirmar = async () => {
    if (pendiente.current) return;
    pendiente.current = true;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la acción.",
      );
    } finally {
      pendiente.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pendiente.current) onClose();
      }}
      className="m-auto w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tono.icono}`}
          >
            <Icono size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {datos.titulo}
            </h2>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <span className="truncate font-medium">{oferta.name}</span>
              <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                {oferta.label}
              </span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-800">{datos.texto}</p>
          <p className="mt-1 text-slate-600">{datos.detalle}</p>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onClose}
          className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Volver
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmar()}
          className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50 ${tono.boton}`}
        >
          <Icono size={16} />
          {busy ? "Guardando…" : datos.boton}
        </button>
      </footer>
    </dialog>
  );
}
