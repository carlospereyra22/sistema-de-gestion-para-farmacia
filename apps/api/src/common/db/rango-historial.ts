import { BadRequestException } from "@nestjs/common";

// Historiales acotados (SISTEMA-74, decisión del usuario del 10/11/2026):
// Compras e Inventario traían todo el historial en cada consulta. Por defecto
// traen los últimos 90 días; para ver lo anterior se elige un rango de fechas.

/** Días que se traen si no se elige un rango. */
export const DIAS_POR_DEFECTO = 90;

/** Argentina no tiene horario de verano: siempre UTC-3. */
const ARGENTINA_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Inicio del día civil de Argentina (AAAA-MM-DD) como instante UTC. */
function inicioDelDia(fecha: string) {
  const instante = new Date(`${fecha}T00:00:00.000Z`);
  if (!FECHA.test(fecha) || instante.toISOString().slice(0, 10) !== fecha)
    throw new BadRequestException("Revisá las fechas del filtro.");
  return new Date(instante.getTime() + ARGENTINA_MS);
}

/**
 * Rango de un historial: desde el inicio de `desde` hasta el final de `hasta`
 * (días civiles de Argentina). Sin `desde`, los últimos 90 días.
 */
export function rangoDeHistorial(
  filtro: { desde?: string; hasta?: string },
  ahora = new Date(),
): { inicio: Date; fin?: Date } {
  const hoy = new Date(ahora.getTime() - ARGENTINA_MS)
    .toISOString()
    .slice(0, 10);
  const inicio = filtro.desde
    ? inicioDelDia(filtro.desde)
    : new Date(inicioDelDia(hoy).getTime() - DIAS_POR_DEFECTO * DIA_MS);
  const fin = filtro.hasta
    ? new Date(inicioDelDia(filtro.hasta).getTime() + DIA_MS - 1)
    : undefined;
  if (fin && fin < inicio)
    throw new BadRequestException(
      "La fecha desde no puede ser posterior a la fecha hasta.",
    );
  return { inicio, fin };
}
