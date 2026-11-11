import type { FiscalSetup } from "./api";

/**
 * Paso "Punto de venta" (SISTEMA-98): una fila por sucursal. Sólo presenta lo
 * que devuelve el servidor; las reglas (número único, no reasignar, baja y
 * alta auditadas) siguen en la API.
 */
export type FilaDePunto = {
  branch: { id: string; name: string };
  /** Punto activo asignado, si tiene. */
  activo?: FiscalSetup["points"][number];
  /** Puntos desactivados de la sucursal (se pueden reactivar). */
  inactivos: FiscalSetup["points"];
};

/** 3 → "0003". */
export const formatearPunto = (numero: number) =>
  String(numero).padStart(4, "0");

export function filasDePuntos(setup: FiscalSetup): FilaDePunto[] {
  return setup.branches.map((branch) => {
    const propios = setup.points.filter(
      (point) => point.branchId === branch.id,
    );
    return {
      branch,
      activo: propios.find((point) => point.active),
      inactivos: propios.filter((point) => !point.active),
    };
  });
}

/**
 * Puntos que informó ARCA para elegir al asignar ("0003 · Web services"),
 * sin los que ya usa esta farmacia (no se reasignan).
 */
export function opcionesDePuntosArca(
  deArca: readonly { number: number }[],
  usados: FiscalSetup["points"],
) {
  const ocupados = new Set(usados.map(({ number }) => number));
  return deArca
    .filter(({ number }) => !ocupados.has(number))
    .map(({ number }) => ({
      value: String(number),
      label: `${formatearPunto(number)} · Web services`,
    }));
}
