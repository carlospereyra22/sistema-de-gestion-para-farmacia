import type { FiscalSetup } from "./api";

export type FiscalStep = 0 | 1 | 2 | 3 | 4;
/** Los 5 pasos, de punta a punta (SISTEMA-95). */
export const fiscalSteps = [
  "Datos de la farmacia",
  "Conexión con ARCA",
  "Punto de venta",
  "Factura de prueba",
  "Facturación real",
] as const;

// Sólo guía la navegación. El estado de la configuración sale del servidor.
export function resumeFiscalStep(checks: FiscalSetup["checks"]): FiscalStep {
  const listo = (code: string) =>
    checks.some((check) => check.code === code && check.ready);
  if (!listo("PROFILE")) return 0;
  if (!listo("AUTH")) return 1;
  if (!listo("POINT")) return 2;
  if (!listo("TRIAL")) return 3;
  return 4;
}
