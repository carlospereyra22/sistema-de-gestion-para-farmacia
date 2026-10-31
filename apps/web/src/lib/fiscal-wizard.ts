import type { FiscalSetup } from "./api";

export type FiscalStep = 0 | 1 | 2 | 3;
export const fiscalSteps = [
  "Tu farmacia",
  "Conexión ARCA",
  "Sucursales",
  "Revisión",
] as const;

// Only guides navigation. Server checks remain the source of configuration status.
export function resumeFiscalStep(checks: FiscalSetup["checks"]): FiscalStep {
  if (!checks.some((check) => check.code === "PROFILE" && check.ready))
    return 0;
  if (!checks.some((check) => check.code === "AUTH" && check.ready)) return 1;
  if (!checks.some((check) => check.code === "POINT" && check.ready)) return 2;
  return 3;
}
