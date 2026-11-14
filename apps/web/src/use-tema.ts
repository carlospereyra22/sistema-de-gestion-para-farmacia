import { useSyncExternalStore } from "react";
import { suscribirTema, temaActual, type Tema } from "./lib/tema";

/** Tema actual (claro/oscuro); se actualiza al cambiarlo, también desde otra pestaña. */
export function useTema(): Tema {
  return useSyncExternalStore(suscribirTema, temaActual, () => "claro");
}
