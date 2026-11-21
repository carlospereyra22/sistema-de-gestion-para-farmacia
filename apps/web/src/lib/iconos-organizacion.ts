import datosGenerales from "../assets/iconos/organizacion/datos-generales.png";
import facturacion from "../assets/iconos/organizacion/facturacion.png";
import sucursales from "../assets/iconos/organizacion/sucursales.png";
import ticketsYComprobantes from "../assets/iconos/organizacion/tickets-y-comprobantes.png";

// Íconos propios de las pestañas de Organización (SISTEMA-110). Las imágenes
// están en src/assets/iconos/organizacion; se dibujan con IconoImagen.
export const ICONOS_ORGANIZACION = {
  general: datosGenerales,
  fiscal: facturacion,
  branches: sucursales,
  tickets: ticketsYComprobantes,
} as const;
