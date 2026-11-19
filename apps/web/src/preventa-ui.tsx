import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, EllipsisVertical, X } from "lucide-react";

import { CLASES_TONO, PUNTO_TONO, type Tono } from "./lib/preventa";

/**
 * Piezas visuales de la preventa (SISTEMA-108), pensadas primero para el
 * celular: tarjetas, pastillas de estado con punto, hoja que sube desde abajo
 * y barra de total fija. Colores por tokens (sirven en modo oscuro).
 */

export const boton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60";
export const botonPrimario = `${boton} bg-teal-700 text-white hover:bg-teal-800`;
export const botonSecundario = `${boton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
/** Botón cuadrado de un solo ícono (llamar, WhatsApp, mapa). */
export const botonIcono =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50";
export const botonPeligro = `${boton} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`;
export const campo =
  "mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:text-sm";

export function Pastilla({
  tono,
  children,
}: {
  tono: Tono;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASES_TONO[tono]}`}
    >
      <span
        className={`size-1.5 rounded-full ${PUNTO_TONO[tono]}`}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function Tarjeta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** Indicador grande: "Pendiente de pago $0,00". */
export function Indicador({
  titulo,
  valor,
  detalle,
  tono = "neutro",
  icono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "bien" | "marca" | "aviso";
  icono?: ReactNode;
}) {
  const franja = {
    neutro: "bg-slate-300",
    bien: "bg-emerald-500",
    marca: "bg-teal-600",
    aviso: "bg-amber-500",
  }[tono];
  const color = {
    neutro: "text-slate-900",
    bien: "text-emerald-700",
    marca: "text-teal-700",
    aviso: "text-amber-700",
  }[tono];
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 pt-4 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${franja}`} aria-hidden />
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icono}
        {titulo}
      </p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums ${color}`}>
        {valor}
      </p>
      {detalle ? (
        <p className="mt-0.5 truncate text-xs text-slate-500">{detalle}</p>
      ) : null}
    </div>
  );
}

/**
 * Hoja que sube desde abajo en el celular y es un diálogo centrado en la PC.
 * Esc o tocar afuera la cierran.
 */
export function Hoja({
  titulo,
  onClose,
  children,
  pie,
  ancho = "max-w-lg",
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialogo.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogo.current) onClose();
      }}
      className={`mx-auto mb-0 mt-auto max-h-[92dvh] w-full rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-velo/40 sm:m-auto sm:rounded-3xl ${ancho}`}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {pie ? (
          <footer className="border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {pie}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export function Interruptor({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          checked ? "bg-teal-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function Vacio({
  icono,
  titulo,
  detalle,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  detalle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
        {icono}
      </span>
      <p className="text-sm font-semibold text-slate-800">{titulo}</p>
      {detalle ? (
        <p className="max-w-sm text-xs text-slate-500">{detalle}</p>
      ) : null}
      {children}
    </div>
  );
}

/** Pestañas tipo segmento ("Pendientes | Pagadas | Todas"). */
export function Segmento<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { id: T; label: string; contador?: number }[];
  valor: T;
  onChange: (valor: T) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sin-barra"
    >
      {opciones.map((opcion) => (
        <button
          key={opcion.id}
          type="button"
          role="tab"
          aria-selected={valor === opcion.id}
          onClick={() => onChange(opcion.id)}
          className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors ${
            valor === opcion.id
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {opcion.label}
          {opcion.contador ? (
            <span
              className={`rounded-full px-1.5 text-xs ${
                valor === opcion.id
                  ? "bg-white/20 text-white"
                  : "bg-white text-slate-700"
              }`}
            >
              {opcion.contador}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Aviso de error o de éxito dentro de una pantalla. */
export function Aviso({
  tipo,
  children,
}: {
  tipo: "error" | "bien" | "info";
  children: ReactNode;
}) {
  const clases = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    bien: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
  }[tipo];
  return (
    <p
      role={tipo === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2 text-sm ${clases}`}
    >
      {children}
    </p>
  );
}

/**
 * Página completa del celular (detalle de un pedido): encabezado de la
 * preventa con flecha para volver, título, menú ⋮ y pie fijo.
 */
export function PantallaCompleta({
  titulo,
  onVolver,
  acciones,
  pie,
  children,
}: {
  titulo: string;
  onVolver: () => void;
  acciones?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialogo.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      onCancel={(event) => {
        event.preventDefault();
        onVolver();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-fondo p-0 text-slate-900"
    >
      <div className="flex h-dvh flex-col">
        <header className="z-10 shrink-0 bg-teal-700 text-white shadow-md">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
            <button
              type="button"
              onClick={onVolver}
              aria-label="Volver"
              className="grid size-11 place-items-center rounded-full hover:bg-white/15"
            >
              <ArrowLeft size={22} aria-hidden />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">
              {titulo}
            </h2>
            {acciones}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-3xl gap-3 px-4 py-4">
            {children}
          </div>
        </div>
        {pie ? (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto grid max-w-3xl gap-2">{pie}</div>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export type AccionMenu = {
  label: string;
  icono: ReactNode;
  onClick: () => void;
  peligro?: boolean;
};

/** Menú ⋮ con las acciones de una pantalla (Editar, Compartir, Cancelar…). */
export function MenuAcciones({
  acciones,
  claro = true,
}: {
  acciones: AccionMenu[];
  /** Botón blanco sobre el encabezado de color. */
  claro?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (evento: PointerEvent) => {
      if (
        evento.target instanceof Node &&
        !raiz.current?.contains(evento.target)
      )
        setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [abierto]);
  if (!acciones.length) return null;
  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label="Más acciones"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`grid size-11 place-items-center rounded-full ${
          claro
            ? "text-white hover:bg-white/15"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <EllipsisVertical size={22} aria-hidden />
      </button>
      {abierto ? (
        <ul
          role="menu"
          className="absolute right-0 top-12 z-20 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 text-slate-800 shadow-xl"
        >
          {acciones.map((accion) => (
            <li key={accion.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAbierto(false);
                  accion.onClick();
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium ${
                  accion.peligro
                    ? "text-rose-700 hover:bg-rose-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={accion.peligro ? "text-rose-600" : "text-teal-700"}
                >
                  {accion.icono}
                </span>
                {accion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Tarjeta con su nombre en el borde ("CLIENTE"), como un campo con etiqueta. */
export function TarjetaEtiquetada({
  etiqueta,
  icono,
  children,
}: {
  etiqueta: string;
  icono?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative mt-2 rounded-2xl border-2 border-teal-700/30 bg-white px-4 pb-3 pt-4">
      <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 bg-fondo px-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-800">
        {icono}
        {etiqueta}
      </span>
      {children}
    </section>
  );
}

/** Bloque de un filtro dentro de la hoja de filtros (Fecha, Estado…). */
export function BloqueFiltro({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700">
          {icono}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Barra grande del total, fija abajo (como en la app de preventistas). */
export function BarraTotal({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(var(--preventa-pie,0px)+0.5rem)] z-10 mt-auto pt-2">
      <div className="flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-4 text-white shadow-lg">
        {children}
      </div>
    </div>
  );
}
