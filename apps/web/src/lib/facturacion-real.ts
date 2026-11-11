// Paso "Facturación real" del asistente (SISTEMA-98).

/** Requisitos antes de activar, en lenguaje simple (SISTEMA-98). */
export const REQUISITOS_REAL = [
  "Tengo el certificado de facturación real (no el de prueba) y lo subí acá.",
  "Tengo un punto de venta real, exclusivo para este sistema y esta sucursal.",
  "Mi contador confirmó los datos de la farmacia.",
] as const;

/** Lo que exige el servidor y no depende de la farmacia. */
export const LO_HABILITA_EL_ADMINISTRADOR =
  "Lo habilita el administrador del sistema.";

/** Error al activar, sin tecnicismos cuando depende del servidor. */
export function mensajeDeActivacion(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  return /todavía no está habilitada|FISCAL_|respaldo|recuperaci|custodio/i.test(
    texto,
  )
    ? LO_HABILITA_EL_ADMINISTRADOR
    : texto || "No se pudo activar.";
}
