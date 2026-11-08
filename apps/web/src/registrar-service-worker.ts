import { registerSW } from "virtual:pwa-register";
import { avisarVersionNueva } from "./lib/version-nueva";

/**
 * Registra el service worker que guarda la app en la PC (modo sin internet).
 * En desarrollo no hay service worker: se prueba con `vite build` + `preview`.
 */
export function registrarServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  const actualizar = registerSW({
    immediate: true,
    onNeedRefresh() {
      avisarVersionNueva(() => void actualizar(true));
    },
  });
}
