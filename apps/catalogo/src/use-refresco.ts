import { useEffect, useRef } from "react";

/**
 * Vuelve a pedir los datos cada `cadaMs` mientras la página está a la vista, y
 * enseguida al volver a ella (en el celular, al volver a la app). Así el
 * cliente ve el cambio de estado de su pedido sin recargar.
 */
export function useRefresco(actualizar: () => void, cadaMs = 15_000) {
  const ultima = useRef(actualizar);
  useEffect(() => {
    ultima.current = actualizar;
  }, [actualizar]);

  useEffect(() => {
    const siVisible = () => {
      if (document.visibilityState === "visible") ultima.current();
    };
    const intervalo = window.setInterval(siVisible, cadaMs);
    document.addEventListener("visibilitychange", siVisible);
    window.addEventListener("focus", siVisible);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", siVisible);
      window.removeEventListener("focus", siVisible);
    };
  }, [cadaMs]);
}
