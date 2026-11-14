import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Aviso flotante con el estilo de la barra lateral del sistema (fondo blanco,
 * borde verde agua): un título y el detalle debajo. Se muestra arriba del
 * elemento al pasar el mouse o al enfocarlo.
 */
export function useAvisoFlotante() {
  const [posicion, setPosicion] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!posicion) return;
    const ocultar = () => setPosicion(null);
    window.addEventListener("scroll", ocultar, true);
    window.addEventListener("resize", ocultar);
    return () => {
      window.removeEventListener("scroll", ocultar, true);
      window.removeEventListener("resize", ocultar);
    };
  }, [posicion]);
  const mostrar = (elemento: Element) => {
    const caja = elemento.getBoundingClientRect();
    setPosicion({ left: caja.left + caja.width / 2, top: caja.top - 8 });
  };
  const ocultar = () => setPosicion(null);
  return {
    disparadores: {
      onMouseEnter: (event: { currentTarget: Element }) =>
        mostrar(event.currentTarget),
      onMouseLeave: ocultar,
      onFocus: (event: { currentTarget: Element }) =>
        mostrar(event.currentTarget),
      onBlur: ocultar,
    },
    ocultar,
    aviso: (contenido: ReactNode) =>
      posicion
        ? createPortal(
            <div
              role="tooltip"
              style={{ left: posicion.left, top: posicion.top }}
              className="pointer-events-none fixed z-[100] w-max max-w-72 -translate-x-1/2 -translate-y-full rounded-[9px] border border-marca-907 bg-white px-3 py-2 text-left shadow-[0_4px_16px_rgb(15_23_42_/_12%)]"
            >
              {contenido}
              <span
                aria-hidden
                className="absolute left-1/2 top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-marca-907 bg-white"
              />
            </div>,
            document.body,
          )
        : null,
  };
}
