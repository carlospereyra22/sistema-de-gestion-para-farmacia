import { useLayoutEffect, useRef, useState } from "react";

/** Margen libre debajo del panel, hasta el borde de la ventana. */
const bottomGap = 16;
/** Por debajo de este alto conviene que scrollee la página entera. */
const minPanelHeight = 420;

/**
 * En escritorio el panel lateral (Roles, Usuarios) ocupa justo lo que queda de
 * pantalla desde donde empieza: el botón de guardar se ve sin bajar y solo
 * scrollea su lista interna. Se mide porque el encabezado cambia de alto según
 * el ancho de la ventana.
 */
export function useFitToViewport<T extends HTMLElement>() {
  const panelRef = useRef<T>(null);
  const [panelHeight, setPanelHeight] = useState<number>();
  useLayoutEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      if (!panel || !window.matchMedia("(min-width: 1024px)").matches)
        return setPanelHeight(undefined);
      const top = panel.getBoundingClientRect().top + window.scrollY;
      setPanelHeight(
        Math.max(minPanelHeight, window.innerHeight - top - bottomGap),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return { panelRef, panelHeight };
}
