import type { AccionOferta, Oferta } from "./ofertas-api";
import type { EstadoOferta } from "./ofertas-motor";

/** Estados y acciones de las ofertas para la web (SISTEMA-103). */
export const ESTADOS_OFERTA: { value: EstadoOferta; label: string }[] = [
  { value: "ACTIVA", label: "Activa" },
  { value: "PROGRAMADA", label: "Programada" },
  { value: "PAUSADA", label: "Pausada" },
  { value: "BORRADOR", label: "Borrador" },
  { value: "VENCIDA", label: "Vencida" },
  { value: "FINALIZADA", label: "Finalizada" },
  { value: "ARCHIVADA", label: "Archivada" },
];

/** Acciones posibles según el estado guardado (las valida la API). */
export function accionesDe(oferta: Pick<Oferta, "status">): AccionOferta[] {
  switch (oferta.status) {
    case "DRAFT":
      return ["publicar", "archivar"];
    case "PUBLISHED":
      return ["pausar", "finalizar", "archivar"];
    case "PAUSED":
      return ["reanudar", "finalizar", "archivar"];
    case "FINISHED":
      return ["archivar"];
    case "ARCHIVED":
      return [];
  }
}
