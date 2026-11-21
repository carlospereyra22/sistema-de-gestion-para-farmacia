import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  guardarPreferenciaMenu,
  leerPreferenciaMenu,
  menuAbiertoAlEntrar,
} from "./lib/menu-lateral-preferencia";

export const SIDEBAR_DESKTOP_QUERY = "(min-width: 1800px)";
const CELULAR_QUERY = "(max-width: 767px)";

const pantalla = () => ({
  grande: window.matchMedia(SIDEBAR_DESKTOP_QUERY).matches,
  celular: window.matchMedia(CELULAR_QUERY).matches,
});

/**
 * Menú lateral abierto o cerrado. Con `usuario`, recuerda en esta PC cómo lo
 * dejó cada persona con el botón (SISTEMA-110); cerrar tocando afuera en el
 * celular no cuenta como elección.
 */
export function useWorkspaceSidebar(usuario?: string) {
  const [expanded, setExpanded] = useState(
    () =>
      typeof window !== "undefined" &&
      menuAbiertoAlEntrar(leerPreferenciaMenu(usuario), pantalla()),
  );
  const shell = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    // Al cambiar el tamaño de la ventana se vuelve a decidir con la
    // preferencia guardada.
    const medias = [SIDEBAR_DESKTOP_QUERY, CELULAR_QUERY].map((query) =>
      window.matchMedia(query),
    );
    const change = () =>
      setExpanded(
        menuAbiertoAlEntrar(leerPreferenciaMenu(usuario), pantalla()),
      );
    for (const media of medias) media.addEventListener("change", change);
    return () => {
      for (const media of medias) media.removeEventListener("change", change);
    };
  }, [usuario]);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      shell.current?.style.setProperty(
        "--workspace-header-height",
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  /** El botón del menú: cambia y lo recuerda para este usuario. */
  const alternar = () =>
    setExpanded((actual) => {
      const siguiente = !actual;
      if (!pantalla().celular)
        guardarPreferenciaMenu(usuario, siguiente ? "abierto" : "cerrado");
      return siguiente;
    });
  return { expanded, setExpanded, alternar, shell, header };
}
