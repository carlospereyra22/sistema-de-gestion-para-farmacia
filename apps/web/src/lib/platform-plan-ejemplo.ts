import { typedCostMinor } from "./lot-cost";

/** Farmacia con la que abre la calculadora de Planes. */
export const EJEMPLO_SUCURSALES = 2;
export const EJEMPLO_USUARIOS = 4;

/**
 * Abono de una farmacia de ejemplo con los precios que se están escribiendo
 * (todavía sin guardar). Es solo una vista previa: el abono real lo calcula la
 * API. Sin `filas` si algún importe no se puede leer.
 */
export function abonoDeEjemplo(
  plan: { includedUsers: number; includedBranches: number },
  precios: { base: string; extraUser: string; extraBranch: string },
  /** Farmacia a calcular; por defecto, 2 sucursales y 4 usuarios. */
  cantidad?: { sucursales: number; usuarios: number },
): {
  sucursales: number;
  usuarios: number;
  filas?: [string, string][];
  totalMinor: string;
} {
  // Nunca menos de lo que el plan incluye: eso ya está en el abono base.
  const sucursales = Math.max(
    cantidad?.sucursales ?? EJEMPLO_SUCURSALES,
    plan.includedBranches,
  );
  const usuarios = Math.max(
    cantidad?.usuarios ?? EJEMPLO_USUARIOS,
    plan.includedUsers,
  );
  try {
    const base = BigInt(typedCostMinor(precios.base));
    const porUsuario = BigInt(typedCostMinor(precios.extraUser));
    const porSucursal = BigInt(typedCostMinor(precios.extraBranch));
    const usuariosExtra = usuarios - plan.includedUsers;
    const sucursalesExtra = sucursales - plan.includedBranches;
    const filas: [string, bigint][] = [["Abono base", base]];
    if (sucursalesExtra > 0)
      filas.push([
        `${sucursalesExtra} ${sucursalesExtra === 1 ? "sucursal adicional" : "sucursales adicionales"}`,
        porSucursal * BigInt(sucursalesExtra),
      ]);
    if (usuariosExtra > 0)
      filas.push([
        `${usuariosExtra} ${usuariosExtra === 1 ? "usuario adicional" : "usuarios adicionales"}`,
        porUsuario * BigInt(usuariosExtra),
      ]);
    const total = filas.reduce((suma, [, importe]) => suma + importe, 0n);
    return {
      sucursales,
      usuarios,
      filas: filas.map(([concepto, importe]) => [concepto, importe.toString()]),
      totalMinor: total.toString(),
    };
  } catch {
    return { sucursales, usuarios, totalMinor: "0" };
  }
}
