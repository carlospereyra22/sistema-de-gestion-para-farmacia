import type { Prisma } from "@prisma/client";

/**
 * Historial de ventas paginado en el servidor (SISTEMA-104). Antes la web
 * pedía las últimas 200 y filtraba ahí: las ventas más viejas no aparecían.
 */
export type FiltroHistorialVentas = {
  /** Fecha civil de Argentina, `YYYY-MM-DD`, inclusive. */
  from?: string;
  to?: string;
  status?: "COMPLETED" | "CANCELLED";
  documentType?: "INTERNAL" | "INVOICE";
  method?: "CASH" | "CARD" | "TRANSFER" | "ACCOUNT" | "OTHER";
  /** Comienzo del código interno (los primeros caracteres del id). */
  q?: string;
};

export const TAMANIO_PAGINA_HISTORIAL = 10;
export const MAXIMO_PAGINA_HISTORIAL = 100;

// Argentina no tiene horario de verano: el día civil empieza a las 03:00 UTC.
const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-03:00`);
const diaSiguiente = (fecha: string) =>
  new Date(inicioDelDia(fecha).getTime() + 24 * 60 * 60 * 1000);

/**
 * Rango de ids que empiezan con `prefijo` (hex, con o sin guiones). Los uuid
 * se comparan byte a byte, igual que su texto en hex, así que un prefijo es un
 * rango y usa la clave primaria. Devuelve undefined si no es un código válido.
 */
export function rangoDeCodigo(
  prefijo: string,
): { gte: string; lte: string } | undefined {
  const hex = prefijo.trim().toLowerCase().replaceAll("-", "");
  if (!hex || hex.length > 32 || !/^[0-9a-f]+$/.test(hex)) return undefined;
  const comoUuid = (texto: string) =>
    [
      texto.slice(0, 8),
      texto.slice(8, 12),
      texto.slice(12, 16),
      texto.slice(16, 20),
      texto.slice(20),
    ].join("-");
  return {
    gte: comoUuid(hex.padEnd(32, "0")),
    lte: comoUuid(hex.padEnd(32, "f")),
  };
}

export function whereHistorialVentas(
  organizationId: string,
  branchId: string,
  filtro: FiltroHistorialVentas,
): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = { organizationId, branchId };
  if (filtro.from || filtro.to)
    where.completedAt = {
      ...(filtro.from ? { gte: inicioDelDia(filtro.from) } : {}),
      ...(filtro.to ? { lt: diaSiguiente(filtro.to) } : {}),
    };
  if (filtro.status) where.status = filtro.status;
  if (filtro.documentType) where.documentType = filtro.documentType;
  if (filtro.method) where.payments = { some: { method: filtro.method } };
  if (filtro.q) {
    const rango = rangoDeCodigo(filtro.q);
    // Un código que no puede existir no trae nada (en vez de ignorarse).
    where.id = rango ?? { in: [] };
  }
  return where;
}
