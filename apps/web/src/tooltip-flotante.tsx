import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ANCHO = 320;
const MARGEN = 8;

/**
 * Globo que aparece al pasar el mouse o al llegar con Tab (SISTEMA-104).
 * Se dibuja fijo sobre la pantalla, así no lo corta una lista con scroll ni
 * el borde de un diálogo. Dentro de un `<dialog>` abierto se monta en el
 * diálogo, que está en la capa superior; si no, en el `body`.
 */
export function TooltipFlotante({
  label,
  trigger,
  children,
  className = "",
  detenerClick = true,
}: {
  /** Texto para lectores de pantalla del botón que abre el globo. */
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  /** false: el clic sigue a la fila (por ejemplo, para abrir el detalle). */
  detenerClick?: boolean;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const ancla = boton.current.getBoundingClientRect();
    const alto = globo.current?.offsetHeight ?? 0;
    const ancho = Math.min(ANCHO, window.innerWidth - MARGEN * 2);
    // Alineado al borde derecho del ícono; abajo si entra, si no arriba.
    const left = Math.min(
      Math.max(MARGEN, ancla.right - ancho),
      window.innerWidth - ancho - MARGEN,
    );
    const abajo = ancla.bottom + MARGEN;
    const top =
      abajo + alto <= window.innerHeight - MARGEN
        ? abajo
        : Math.max(MARGEN, ancla.top - alto - MARGEN);
    setPosicion({ top, left });
  }, [abierto]);
  const destino =
    abierto && boton.current
      ? (boton.current.closest("dialog[open]") ?? document.body)
      : null;
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={label}
        aria-expanded={abierto}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && abierto) {
            event.stopPropagation();
            setAbierto(false);
          }
        }}
        onClick={(event) => {
          if (detenerClick) event.stopPropagation();
        }}
        className={`inline-grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${className}`}
      >
        {trigger}
      </button>
      {destino &&
        createPortal(
          <div
            ref={globo}
            role="tooltip"
            style={{
              position: "fixed",
              top: posicion.top,
              left: posicion.left,
              width: Math.min(ANCHO, window.innerWidth - MARGEN * 2),
            }}
            className="pointer-events-none z-[1000] rounded-xl border border-slate-200 bg-white text-left text-xs shadow-lg"
          >
            {children}
          </div>,
          destino,
        )}
    </>
  );
}
