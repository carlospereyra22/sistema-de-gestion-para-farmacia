import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  aTexto,
  comparar,
  desdeTexto,
  diaDeLaSemana,
  formatoCorto,
  formatoLargo,
  hoy as hoyDelDia,
  nombreDelMes,
  semanasDelMes,
  sumarDias,
  sumarMeses,
  type Dia,
} from "./lib/calendario";

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

/**
 * Selector de fecha del sistema (SISTEMA-110). Reemplaza a <input type=date>:
 * mismo campo que ProductFilterSelect (blanco, ícono teal, etiqueta arriba y
 * valor abajo) y un calendario propio, en español y empezando el lunes.
 * El valor es el texto "AAAA-MM-DD" de siempre, o "" sin fecha.
 */
export function SelectorFecha({
  label,
  value,
  onChange,
  compact = false,
  disabled = false,
  min,
  max,
  vacio = "Sin fecha",
  permitirVacio = true,
  icon = <CalendarDays size={compact ? 16 : 18} aria-hidden />,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Para formularios y diálogos: h-10 y la etiqueta va afuera. */
  compact?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  /** Lo que se lee sin fecha elegida. */
  vacio?: string;
  /** Muestra "Borrar" para dejarlo sin fecha. */
  permitirVacio?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const grilla = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const elegido = desdeTexto(value);
  const minimo = desdeTexto(min);
  const maximo = desdeTexto(max);
  const [abierto, setAbierto] = useState(false);
  // El calendario flota por encima de todo (fixed, en el diálogo abierto si
  // hay uno): así un diálogo con bordes recortados no lo corta.
  const [posicion, setPosicion] = useState<CSSProperties>({});
  const [foco, setFoco] = useState<Dia>(() => elegido ?? hoyDelDia());
  const hoy = hoyDelDia();
  const fueraDeRango = (dia: Dia) =>
    (minimo && comparar(dia, minimo) < 0) ||
    (maximo && comparar(dia, maximo) > 0);

  const abrir = () => {
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    // Medidas del calendario (w-[16.5rem]) y margen al borde del bloque.
    const ANCHO = 264;
    const ALTO = 318;
    const margen = 8;
    // El calendario no sale del bloque donde está (el diálogo abierto o, si
    // no hay, la ventana).
    const caja = root.current
      ?.closest("dialog, [role='dialog'], [aria-modal='true']")
      ?.getBoundingClientRect();
    const limite = {
      left: Math.max(caja?.left ?? 0, 0),
      right: Math.min(caja?.right ?? window.innerWidth, window.innerWidth),
      top: Math.max(caja?.top ?? 0, 0),
      bottom: Math.min(caja?.bottom ?? window.innerHeight, window.innerHeight),
    };
    // Alineado con el campo; si no entra a la derecha, se corre adentro.
    const izquierda = Math.max(
      limite.left + margen,
      Math.min(bounds.left, limite.right - margen - ANCHO),
    );
    const abajo = limite.bottom - bounds.bottom - margen;
    const encima = bounds.top - limite.top - margen;
    // Abajo si entra; si no, arriba si entra o si hay más lugar.
    setPosicion(
      abajo < ALTO && (encima >= ALTO || encima > abajo)
        ? { left: izquierda, bottom: window.innerHeight - bounds.top + 6 }
        : { left: izquierda, top: bounds.bottom + 6 },
    );
    setFoco(elegido ?? hoy);
    setAbierto(true);
  };
  const dentro = (nodo: EventTarget | null) =>
    nodo instanceof Node &&
    Boolean(root.current?.contains(nodo) || panel.current?.contains(nodo));
  const elegir = (dia: Dia | null) => {
    if (dia && fueraDeRango(dia)) return;
    onChange(dia ? aTexto(dia) : "");
    setAbierto(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (event: PointerEvent) => {
      if (!dentro(event.target)) setAbierto(false);
    };
    // Flota fijo en la pantalla: si se desplaza la página, se cierra.
    const alDesplazar = (event: Event) => {
      if (!dentro(event.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", alDesplazar);
    return () => {
      document.removeEventListener("pointerdown", cerrar);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", alDesplazar);
    };
  }, [abierto]);
  // El día con foco recibe el foco del teclado al moverse con las flechas.
  useEffect(() => {
    if (!abierto) return;
    grilla.current
      ?.querySelector<HTMLButtonElement>(`[data-dia="${aTexto(foco)}"]`)
      ?.focus();
  }, [abierto, foco]);

  const teclas = (event: KeyboardEvent) => {
    const mover: Record<string, () => Dia> = {
      ArrowLeft: () => sumarDias(foco, -1),
      ArrowRight: () => sumarDias(foco, 1),
      ArrowUp: () => sumarDias(foco, -7),
      ArrowDown: () => sumarDias(foco, 7),
      PageUp: () => sumarMeses(foco, -1),
      PageDown: () => sumarMeses(foco, 1),
      Home: () => sumarDias(foco, -diaDeLaSemana(foco)),
      End: () => sumarDias(foco, 6 - diaDeLaSemana(foco)),
    };
    const siguiente = mover[event.key];
    if (siguiente) {
      event.preventDefault();
      setFoco(siguiente());
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setAbierto(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  };

  const semanas = semanasDelMes(foco.anio, foco.mes);
  return (
    <div
      ref={root}
      className="selector-fecha relative min-w-0"
      onBlur={(event) => {
        if (!dentro(event.relatedTarget)) setAbierto(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${elegido ? formatoLargo(elegido) : vacio}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !abierto) {
            event.preventDefault();
            abrir();
          } else if (event.key === "Escape" && abierto) {
            event.preventDefault();
            event.stopPropagation();
            setAbierto(false);
          }
        }}
        className={`flex ${compact ? "h-10" : "h-12"} w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 text-left shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${abierto ? "border-teal-400 ring-2 ring-teal-500/10" : "border-slate-200"}`}
      >
        {icon && <span className="shrink-0 text-teal-600">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span
            className={
              compact
                ? "sr-only"
                : "block text-[13px] font-medium leading-4 text-slate-600"
            }
          >
            {label}
          </span>
          <span
            className={`block truncate text-sm tabular-nums ${elegido ? (compact ? "text-slate-700" : "font-medium leading-5 text-slate-800") : "text-slate-400"}`}
          >
            {elegido ? formatoCorto(elegido) : vacio}
          </span>
        </span>
      </button>
      {abierto &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={`Elegir ${label.toLocaleLowerCase("es-AR")}`}
            onKeyDown={teclas}
            style={posicion}
            className="fixed z-[90] w-[16.5rem] rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_12px_32px_-8px_rgba(15,60,80,.25)]"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setFoco(sumarMeses(foco, -1))}
                className="grid size-7 place-items-center rounded-lg text-teal-700 hover:bg-teal-50"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <p
                aria-live="polite"
                className="text-sm font-semibold text-slate-800"
              >
                {nombreDelMes(foco.anio, foco.mes)}
              </p>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => setFoco(sumarMeses(foco, 1))}
                className="grid size-7 place-items-center rounded-lg text-teal-700 hover:bg-teal-50"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            <div
              ref={grilla}
              role="grid"
              aria-label={nombreDelMes(foco.anio, foco.mes)}
              className="grid grid-cols-7 gap-0.5"
            >
              {DIAS_SEMANA.map((dia) => (
                <span
                  key={dia}
                  role="columnheader"
                  className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {dia}
                </span>
              ))}
              {semanas.flat().map((dia) => {
                const texto = aTexto(dia);
                const delMes = dia.mes === foco.mes;
                const esElegido = elegido && comparar(dia, elegido) === 0;
                const esHoy = comparar(dia, hoy) === 0;
                const bloqueado = Boolean(fueraDeRango(dia));
                return (
                  <button
                    key={texto}
                    type="button"
                    role="gridcell"
                    data-dia={texto}
                    tabIndex={comparar(dia, foco) === 0 ? 0 : -1}
                    disabled={bloqueado}
                    aria-label={formatoLargo(dia)}
                    aria-selected={Boolean(esElegido)}
                    aria-current={esHoy ? "date" : undefined}
                    onClick={() => elegir(dia)}
                    className={`grid h-8 place-items-center rounded-lg text-[13px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:text-slate-200 ${
                      esElegido
                        ? "bg-teal-700 font-semibold text-white shadow-sm"
                        : esHoy
                          ? "font-semibold text-teal-700 ring-1 ring-inset ring-teal-300 hover:bg-teal-50"
                          : delMes
                            ? "text-slate-700 hover:bg-teal-50 hover:text-teal-800"
                            : "text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {dia.dia}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5">
              <button
                type="button"
                disabled={Boolean(fueraDeRango(hoy))}
                onClick={() => elegir(hoy)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-40"
              >
                Hoy
              </button>
              {permitirVacio && (
                <button
                  type="button"
                  onClick={() => elegir(null)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-rose-700"
                >
                  <X size={12} aria-hidden /> Borrar
                </button>
              )}
            </div>
          </div>,
          // Dentro del diálogo abierto (capa superior) o en el cuerpo.
          root.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}
