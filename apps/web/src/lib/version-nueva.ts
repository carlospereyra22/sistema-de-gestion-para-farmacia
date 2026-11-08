import { useSyncExternalStore } from "react";

// Aviso de versión nueva del sistema (service worker). Nunca se recarga solo:
// la persona elige cuándo, así no se pierde una venta a medio hacer.

let disponible = false;
let aplicar: (() => void) | undefined;
const oyentes = new Set<() => void>();

export function avisarVersionNueva(actualizar: () => void) {
  disponible = true;
  aplicar = actualizar;
  for (const oyente of oyentes) oyente();
}

export function actualizarAhora() {
  aplicar?.();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function useVersionNueva() {
  return useSyncExternalStore(
    suscribir,
    () => disponible,
    () => false,
  );
}
