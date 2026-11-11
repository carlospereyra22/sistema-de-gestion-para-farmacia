import type { Prisma } from "@prisma/client";

/**
 * Sesiones abiertas de un usuario (SISTEMA-93): las que todavía pueden
 * renovarse. Las de soporte del superadmin no se listan a la farmacia.
 */
export type SesionAbierta = {
  id: string;
  navegador: string | null;
  ip: string | null;
  deviceId: string | null;
  iniciada: string;
  ultimoUso: string;
  /** Es la sesión desde la que se consulta. */
  actual: boolean;
};

type Db = Pick<Prisma.TransactionClient, "authSession">;

export function filtroDeAbiertas(
  userId: string,
  ahora: Date,
  limiteMs: number,
): Prisma.AuthSessionWhereInput {
  return {
    userId,
    revokedAt: null,
    soporte: false,
    lastUsedAt: { gte: new Date(ahora.getTime() - limiteMs) },
    OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }],
  };
}

export async function sesionesAbiertasDe(
  db: Db,
  userId: string,
  ahora: Date,
  limiteMs: number,
  sesionActual?: string,
): Promise<SesionAbierta[]> {
  const sesiones = await db.authSession.findMany({
    where: filtroDeAbiertas(userId, ahora, limiteMs),
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      deviceId: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  return sesiones.map((sesion) => ({
    id: sesion.id,
    navegador: sesion.userAgent,
    ip: sesion.ip,
    deviceId: sesion.deviceId,
    iniciada: sesion.createdAt.toISOString(),
    ultimoUso: sesion.lastUsedAt.toISOString(),
    actual: sesion.id === sesionActual,
  }));
}
