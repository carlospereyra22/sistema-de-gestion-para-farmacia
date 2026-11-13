import type { FiltroHistorialVentas } from "./api";

/**
 * Filtro del historial hecho en la PC (SISTEMA-104), con las mismas reglas
 * que el servidor: se usa para las ventas sin enviar y, sin conexión, sobre
 * la copia local. Las fechas son días civiles de Argentina.
 */
type VentaFiltrable = {
  id: string;
  status: string;
  documentType?: string;
  completedAt: string | null;
  payments: { method: string }[];
};

/** Día civil de Argentina (UTC-3, sin horario de verano) de un instante. */
export function diaArgentino(instante: string): string {
  return new Date(new Date(instante).getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function filtrarHistorialLocal<T extends VentaFiltrable>(
  ventas: readonly T[],
  filtro: FiltroHistorialVentas,
): T[] {
  const codigo = filtro.q?.trim().toLowerCase().replaceAll("-", "");
  return ventas
    .filter((venta) => {
      const dia = venta.completedAt ? diaArgentino(venta.completedAt) : "";
      return (
        (!filtro.from || dia >= filtro.from) &&
        (!filtro.to || (dia !== "" && dia <= filtro.to)) &&
        (!filtro.status || venta.status === filtro.status) &&
        (!filtro.documentType ||
          (venta.documentType ?? "INTERNAL") === filtro.documentType) &&
        (!filtro.method ||
          venta.payments.some((pago) => pago.method === filtro.method)) &&
        (!codigo || venta.id.replaceAll("-", "").startsWith(codigo))
      );
    })
    .sort(
      (a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? "") ||
        b.id.localeCompare(a.id),
    );
}
